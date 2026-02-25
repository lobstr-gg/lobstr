#!/usr/bin/env node

/**
 * Quick local test: generate a test scenario and see the output.
 *
 * Usage:
 *   OPENAI_API_KEY="sk-..." node scripts/test-generate.mjs
 *
 * Optional (to actually upload files):
 *   FIREBASE_SERVICE_ACCOUNT_KEY="$(cat /path/to/sa.json)" \
 *   OPENAI_API_KEY="sk-..." \
 *   node scripts/test-generate.mjs --upload
 */

import OpenAI from "openai";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const UPLOAD = process.argv.includes("--upload");

const SYSTEM_PROMPT = `You generate arbitrator competency test scenarios for LOBSTR, a decentralized marketplace for AI agent commerce on Base (Ethereum L2). Currency is LOB tokens.

Generate a realistic dispute between a buyer and seller of a digital service. All dates should be in February 2026. Service types: design, development, data scraping, writing, translation, consulting, security auditing, smart contract work, marketing, video editing, etc.

THE SCENARIO MUST:
- Have ONE objectively correct ruling (BuyerWins or SellerWins) supported by the evidence
- Contain real nuance — the losing side should have a plausible-sounding argument that falls apart under careful analysis
- Include specific contract clauses that are pivotal to the ruling
- Roughly half the time BuyerWins, half the time SellerWins

EVIDENCE FILES — generate exactly 3:

1. PDF (contract/agreement) — MUST have 5-6 detailed sections. Include:
   - PARTIES section with full names and roles
   - SCOPE OF WORK with specific deliverables, formats, requirements
   - COMPENSATION with exact LOB amounts and payment schedule
   - TIMELINE with specific dates
   - ACCEPTANCE CRITERIA or DELIVERY REQUIREMENTS with measurable standards
   - At least one additional clause relevant to the dispute (IP rights, subcontracting prohibition, late delivery terms, quality standards, etc.)
   The "content" field is a JSON array: [{"heading":"PARTIES","body":"This contract is between..."},...]

2. IMAGE (visual evidence) — a DALL-E prompt for a screenshot or visual that's relevant to the dispute. Examples: a chat interface showing key messages, a delivered design that doesn't match specs, a bug report screenshot, a side-by-side comparison. The prompt MUST be hyper-specific: describe exact UI elements, colors, text visible on screen, layout. Include "realistic screenshot, high detail, sharp text, modern UI design" in every prompt. NEVER request text that says specific words — DALL-E can't render text reliably. Instead describe the visual layout and elements.

3. CSV (records/logs) — MUST have a header row plus 6-10 data rows. Include realistic data: dates (YYYY-MM-DD format), descriptions, LOB amounts, status values, names, transaction hashes (0xabc...def format). Examples: payment ledger, delivery timeline, access logs, bug tracking, time sheets.

MC QUESTIONS — exactly 5, each with 4 options:
- Questions MUST require actually reading the evidence to answer — not guessable from context
- Include at least 2 questions that require cross-referencing multiple evidence files
- Wrong options should be plausible, not obviously wrong
- At least 1 question should test understanding of a specific contract clause
- At least 1 question should test interpretation of the timeline/records

ANALYSIS PROMPT — 2-3 sentences telling the arbitrator what to evaluate. Reference specific evidence files by name.

GRADING RUBRIC — 6-7 bullet points of specific things a thorough analysis should identify. Each point should reference a specific piece of evidence or contract clause.

Respond with ONLY valid JSON (no markdown fences):
{
  "title": "string — format: 'Service Type — Core Issue', e.g. 'Smart Contract Audit — Missed Critical Vulnerability'",
  "description": "string — 2-3 sentence dispute summary with both sides' positions",
  "expectedRuling": "BuyerWins" or "SellerWins",
  "evidenceSpecs": [
    {"type": "pdf", "name": "Contract_Name.pdf", "description": "what this is", "content": "[{...5-6 sections...}]"},
    {"type": "image", "name": "Evidence_Name.png", "description": "what this shows", "content": "DALL-E prompt..."},
    {"type": "csv", "name": "Records_Name.csv", "description": "what these show", "content": "Col1,Col2,Col3\\nval,val,val\\n...6-10 rows"}
  ],
  "mcQuestions": [{"question":"...","options":["a","b","c","d"],"correctIndex":0}],
  "analysisPrompt": "string",
  "gradingRubric": "string — 6-7 bullet points separated by newlines"
}`;

// ── PDF gen (same pattern as seed-scenarios.mjs) ────────────────────────────

function wrapText(text, font, fontSize, maxWidth) {
  const lines = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.trim() === "") { lines.push(""); continue; }
    const words = paragraph.split(" ");
    let currentLine = "";
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);
      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
  }
  return lines;
}

/** Strip non-WinAnsi unicode chars that pdf-lib can't encode. */
function sanitize(text) {
  return text
    .replace(/[\u2010-\u2015]/g, "-")  // unicode hyphens → ASCII hyphen
    .replace(/[\u2018\u2019]/g, "'")   // smart single quotes
    .replace(/[\u201C\u201D]/g, '"')   // smart double quotes
    .replace(/\u2026/g, "...")          // ellipsis
    .replace(/\u2013/g, "-")           // en dash
    .replace(/\u2014/g, "--")          // em dash
    .replace(/[^\x00-\xFF]/g, "");     // drop anything else non-latin1
}

async function generatePDF(title, sections) {
  title = sanitize(title);
  sections = sections.map(s => ({
    heading: s.heading ? sanitize(s.heading) : undefined,
    body: s.body ? sanitize(s.body) : undefined,
  }));
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595, 842]);
  let y = 800;
  const margin = 50;
  const width = 595 - margin * 2;

  page.drawText(title, { x: margin, y, font: fontBold, size: 18, color: rgb(0, 0, 0) });
  y -= 30;
  page.drawLine({ start: { x: margin, y }, end: { x: margin + width, y }, thickness: 1, color: rgb(0.7, 0.7, 0.7) });
  y -= 20;

  for (const section of sections) {
    if (section.heading) {
      if (y < 80) { page = doc.addPage([595, 842]); y = 800; }
      page.drawText(section.heading, { x: margin, y, font: fontBold, size: 12, color: rgb(0.2, 0.2, 0.2) });
      y -= 18;
    }
    if (section.body) {
      const lines = wrapText(section.body, font, 10, width);
      for (const line of lines) {
        if (y < 50) { page = doc.addPage([595, 842]); y = 800; }
        page.drawText(line, { x: margin, y, font, size: 10, color: rgb(0.15, 0.15, 0.15) });
        y -= 14;
      }
      y -= 8;
    }
  }
  return Buffer.from(await doc.save());
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const sessionId = randomUUID();
  const outDir = path.join("scripts", `test-output-${sessionId.slice(0, 8)}`);
  fs.mkdirSync(outDir, { recursive: true });

  // Step 1: GPT-4o generates scenario
  console.log("\n🧠 Generating scenario with GPT-4o...\n");
  const t0 = Date.now();

  const completion = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: "Generate a unique arbitrator competency test scenario. Vary the service type and dispute." },
    ],
    temperature: 1.0,
    max_completion_tokens: 4000,
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  const scenario = JSON.parse(cleaned);

  console.log(`✓ Scenario generated in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  Title: ${scenario.title}`);
  console.log(`  Ruling: ${scenario.expectedRuling}`);
  console.log(`  Evidence: ${scenario.evidenceSpecs.length} files`);
  console.log(`  Questions: ${scenario.mcQuestions.length}`);

  // Save raw JSON
  fs.writeFileSync(path.join(outDir, "scenario.json"), JSON.stringify(scenario, null, 2));
  console.log(`\n📄 Scenario JSON saved to ${outDir}/scenario.json`);

  // Step 2: Generate evidence files
  for (const spec of scenario.evidenceSpecs) {
    const t1 = Date.now();

    if (spec.type === "pdf") {
      console.log(`\n📑 Generating PDF: ${spec.name}...`);
      let sections;
      try { sections = JSON.parse(spec.content); }
      catch { sections = [{ body: spec.content }]; }

      const buf = await generatePDF(spec.description || spec.name, sections);
      fs.writeFileSync(path.join(outDir, spec.name), buf);
      console.log(`  ✓ ${spec.name} (${(buf.length / 1024).toFixed(1)} KB, ${((Date.now() - t1) / 1000).toFixed(1)}s)`);

    } else if (spec.type === "image") {
      console.log(`\n🎨 Generating image with DALL-E: ${spec.name}...`);
      console.log(`  Prompt: "${spec.content.slice(0, 80)}..."`);

      const response = await openai.images.generate({
        model: "gpt-image-1",
        prompt: spec.content,
        n: 1,
        size: "1536x1024",
        quality: "high",
      });
      const buf = Buffer.from(response.data[0].b64_json, "base64");
      fs.writeFileSync(path.join(outDir, spec.name), buf);
      console.log(`  ✓ ${spec.name} (${(buf.length / 1024).toFixed(1)} KB, ${((Date.now() - t1) / 1000).toFixed(1)}s)`);

    } else if (spec.type === "csv") {
      console.log(`\n📊 Generating CSV: ${spec.name}...`);
      fs.writeFileSync(path.join(outDir, spec.name), spec.content);
      console.log(`  ✓ ${spec.name} (${spec.content.length} bytes)`);
    }
  }

  // Step 3: Print test preview
  console.log("\n" + "═".repeat(60));
  console.log(`TEST PREVIEW: ${scenario.title}`);
  console.log("═".repeat(60));
  console.log(`\n${scenario.description}\n`);

  console.log("─── MC Questions ───");
  for (let i = 0; i < scenario.mcQuestions.length; i++) {
    const q = scenario.mcQuestions[i];
    console.log(`\n  ${i + 1}. ${q.question}`);
    for (let j = 0; j < q.options.length; j++) {
      const marker = j === q.correctIndex ? " ← correct" : "";
      console.log(`     ${j + 1}) ${q.options[j]}${marker}`);
    }
  }

  console.log("\n─── Analysis Prompt ───");
  console.log(scenario.analysisPrompt);

  console.log("\n─── Grading Rubric ───");
  console.log(scenario.gradingRubric);

  console.log(`\n─── Expected Ruling ───`);
  console.log(scenario.expectedRuling);

  console.log(`\n✅ All files saved to ${outDir}/`);
  console.log(`   Open the PDF and image to verify quality.\n`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
