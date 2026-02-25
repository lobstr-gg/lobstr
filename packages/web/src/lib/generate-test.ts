import "server-only";
import OpenAI from "openai";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getBucket } from "./firebase-admin";

// ── Types ───────────────────────────────────────────────────────────────────

interface PdfSection {
  heading?: string;
  body?: string;
}

interface EvidenceSpec {
  type: "pdf" | "image" | "csv";
  name: string;
  description: string;
  content: string; // PDF sections as JSON string, DALL-E prompt for images, CSV text for csvs
}

export interface GeneratedScenario {
  title: string;
  description: string;
  expectedRuling: "BuyerWins" | "SellerWins";
  evidenceSpecs: EvidenceSpec[];
  mcQuestions: {
    question: string;
    options: string[];
    correctIndex: number;
  }[];
  analysisPrompt: string;
  gradingRubric: string;
}

export interface EvidenceFile {
  name: string;
  type: "pdf" | "image" | "csv";
  url: string;
}

// ── GPT Prompt ──────────────────────────────────────────────────────────────

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

// ── OpenAI Client ───────────────────────────────────────────────────────────

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  return new OpenAI({ apiKey });
}

// ── PDF Generation (reuses pattern from seed-scenarios.mjs) ─────────────────

function wrapText(
  text: string,
  font: { widthOfTextAtSize: (text: string, size: number) => number },
  fontSize: number,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
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
function sanitize(text: string): string {
  return text
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u2013/g, "-")
    .replace(/\u2014/g, "--")
    .replace(/[^\x00-\xFF]/g, "");
}

async function generatePDF(
  title: string,
  sections: PdfSection[]
): Promise<Buffer> {
  title = sanitize(title);
  sections = sections.map((s) => ({
    heading: s.heading ? sanitize(s.heading) : undefined,
    body: s.body ? sanitize(s.body) : undefined,
  }));
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([595, 842]); // A4
  let y = 800;
  const margin = 50;
  const width = 595 - margin * 2;

  // Title
  page.drawText(title, {
    x: margin,
    y,
    font: fontBold,
    size: 18,
    color: rgb(0, 0, 0),
  });
  y -= 30;

  // Line
  page.drawLine({
    start: { x: margin, y },
    end: { x: margin + width, y },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 20;

  for (const section of sections) {
    if (section.heading) {
      if (y < 80) {
        page = doc.addPage([595, 842]);
        y = 800;
      }
      page.drawText(section.heading, {
        x: margin,
        y,
        font: fontBold,
        size: 12,
        color: rgb(0.2, 0.2, 0.2),
      });
      y -= 18;
    }

    if (section.body) {
      const lines = wrapText(section.body, font as any, 10, width);
      for (const line of lines) {
        if (y < 50) {
          page = doc.addPage([595, 842]);
          y = 800;
        }
        page.drawText(line, {
          x: margin,
          y,
          font,
          size: 10,
          color: rgb(0.15, 0.15, 0.15),
        });
        y -= 14;
      }
      y -= 8;
    }
  }

  return Buffer.from(await doc.save());
}

// ── DALL-E Image Generation ─────────────────────────────────────────────────

async function generateImage(
  openai: OpenAI,
  prompt: string
): Promise<Buffer> {
  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    n: 1,
    size: "1536x1024",
    quality: "high",
  });
  const b64_json = response.data?.[0]?.b64_json;
  if (!b64_json) {
    throw new Error("No image data returned from OpenAI");
  }
  return Buffer.from(b64_json, "base64");
}

// ── Firebase Storage Upload ─────────────────────────────────────────────────

async function uploadFile(
  storagePath: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const bucket = getBucket();
  const file = bucket.file(storagePath);
  await file.save(buffer, { metadata: { contentType } });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
}

// ── Main: Generate Test ─────────────────────────────────────────────────────

export async function generateTest(sessionId: string): Promise<{
  scenario: GeneratedScenario;
  evidenceFiles: EvidenceFile[];
}> {
  const openai = getOpenAI();

  // Step 1: GPT-4o generates the scenario structure
  const completion = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content:
          "Generate a unique arbitrator competency test scenario. Make it different from common examples — vary the service type, the nature of the dispute, and which side is in the right.",
      },
    ],
    temperature: 1.0,
    max_completion_tokens: 4000,
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("Empty response from GPT-4o");

  const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

  let scenario: GeneratedScenario;
  try {
    scenario = JSON.parse(cleaned);
  } catch {
    throw new Error("Failed to parse GPT-4o response as JSON");
  }

  // Validate
  if (
    !scenario.title ||
    !scenario.description ||
    !["BuyerWins", "SellerWins"].includes(scenario.expectedRuling) ||
    !Array.isArray(scenario.evidenceSpecs) ||
    scenario.evidenceSpecs.length < 2 ||
    !Array.isArray(scenario.mcQuestions) ||
    scenario.mcQuestions.length !== 5 ||
    !scenario.analysisPrompt ||
    !scenario.gradingRubric
  ) {
    throw new Error("Generated scenario failed validation");
  }

  for (const q of scenario.mcQuestions) {
    if (
      !q.question ||
      !Array.isArray(q.options) ||
      q.options.length !== 4 ||
      typeof q.correctIndex !== "number" ||
      q.correctIndex < 0 ||
      q.correctIndex > 3
    ) {
      throw new Error("Generated MC question failed validation");
    }
  }

  // Step 2: Generate evidence files
  const evidenceFiles: EvidenceFile[] = [];

  for (const spec of scenario.evidenceSpecs) {
    let buffer: Buffer;
    let contentType: string;

    switch (spec.type) {
      case "pdf": {
        let sections: PdfSection[];
        try {
          sections = JSON.parse(spec.content);
        } catch {
          // Fallback: treat content as a single body block
          sections = [{ body: spec.content }];
        }
        buffer = await generatePDF(spec.description || spec.name, sections);
        contentType = "application/pdf";
        break;
      }

      case "image": {
        buffer = await generateImage(openai, spec.content);
        contentType = "image/png";
        break;
      }

      case "csv": {
        buffer = Buffer.from(spec.content, "utf-8");
        contentType = "text/csv";
        break;
      }

      default:
        continue;
    }

    const storagePath = `test-evidence/${sessionId}/${spec.name}`;
    const url = await uploadFile(storagePath, buffer, contentType);

    evidenceFiles.push({
      name: spec.name,
      type: spec.type,
      url,
    });
  }

  return { scenario, evidenceFiles };
}

// ── Grade Analysis ──────────────────────────────────────────────────────────

export async function gradeAnalysis(
  gradingRubric: string,
  analysis: string
): Promise<{ score: number; feedback: string }> {
  const openai = getOpenAI();

  const completion = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      {
        role: "system",
        content: `You are grading an arbitrator's written analysis of a marketplace dispute. Score from 0 to 100 based on how well the analysis addresses the key points.

Respond with ONLY valid JSON (no markdown, no code fences):
{"score": <number 0-100>, "feedback": "<2-3 sentence explanation of the score>"}`,
      },
      {
        role: "user",
        content: `## Grading Rubric\n${gradingRubric}\n\n## Arbitrator's Analysis\n${analysis}`,
      },
    ],
    temperature: 0.3,
    max_completion_tokens: 300,
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("Empty grading response from GPT-4o");

  const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

  try {
    const result = JSON.parse(cleaned);
    return {
      score: Math.max(0, Math.min(100, Math.round(result.score))),
      feedback: result.feedback || "",
    };
  } catch {
    return { score: 0, feedback: "Failed to parse grading response" };
  }
}
