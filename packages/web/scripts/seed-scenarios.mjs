#!/usr/bin/env node

/**
 * Seed 15 arbitrator competency test scenarios into Firestore + Firebase Storage.
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT_KEY="$(cat /path/to/service-account.json)" \
 *   FIREBASE_STORAGE_BUCKET="lobstr-8ec05.firebasestorage.app" \
 *   OPENAI_API_KEY="sk-..." \
 *   node scripts/seed-scenarios.mjs
 *
 * Generates: PDFs (contracts, invoices, receipts), SVGs (chat screenshots),
 *            CSVs (payment records, timelines), AI-generated images (logos, screenshots)
 *            — all uploaded to Firebase Storage.
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import OpenAI from "openai";

// ── Firebase Init ────────────────────────────────────────────────────────────

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || "lobstr-8ec05.firebasestorage.app";

const app = initializeApp({
  credential: cert(serviceAccount),
  storageBucket,
});

const db = getFirestore(app);
const bucket = getStorage(app).bucket();

// ── OpenAI Init (for DALL-E image generation) ────────────────────────────────

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Generate an image via DALL-E 3 and return it as a Buffer.
 * Uses standard quality (1024x1024) to keep costs low (~$0.04/image).
 */
async function generateImage(prompt) {
  console.log(`    🎨 Generating image: "${prompt.slice(0, 60)}..."`);
  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt,
    n: 1,
    size: "1024x1024",
    quality: "standard",
    response_format: "b64_json",
  });
  return Buffer.from(response.data[0].b64_json, "base64");
}

/**
 * Generate a website screenshot mockup via DALL-E 3 (wide format).
 * Uses 1792x1024 for landscape browser screenshots.
 */
async function generateScreenshot(prompt) {
  console.log(`    🎨 Generating screenshot: "${prompt.slice(0, 60)}..."`);
  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt,
    n: 1,
    size: "1792x1024",
    quality: "standard",
    response_format: "b64_json",
  });
  return Buffer.from(response.data[0].b64_json, "base64");
}

// ── File Generators ──────────────────────────────────────────────────────────

async function generatePDF(title, sections) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([595, 842]); // A4
  let y = 800;
  const margin = 50;
  const width = 595 - margin * 2;

  // Title
  page.drawText(title, { x: margin, y, font: fontBold, size: 18, color: rgb(0, 0, 0) });
  y -= 30;

  // Thin line
  page.drawLine({ start: { x: margin, y }, end: { x: margin + width, y }, thickness: 1, color: rgb(0.7, 0.7, 0.7) });
  y -= 20;

  for (const section of sections) {
    // Section header
    if (section.heading) {
      if (y < 80) { page = doc.addPage([595, 842]); y = 800; }
      page.drawText(section.heading, { x: margin, y, font: fontBold, size: 12, color: rgb(0.2, 0.2, 0.2) });
      y -= 18;
    }

    // Body text — wrap lines
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

function generateChatSVG(title, messages, width = 600, bgColor = "#1a1a2e") {
  const lineHeight = 22;
  const padding = 20;
  const headerHeight = 50;
  let y = headerHeight + padding;

  // Pre-calculate height
  for (const msg of messages) {
    const lines = Math.ceil(msg.text.length / 55) + 1; // rough estimate
    y += (lines * lineHeight) + 15;
  }
  const height = y + padding;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<rect width="${width}" height="${height}" fill="${bgColor}"/>`;

  // Header bar
  svg += `<rect width="${width}" height="${headerHeight}" fill="#16213e"/>`;
  svg += `<text x="${padding}" y="32" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#e0e0e0">${escXml(title)}</text>`;

  y = headerHeight + padding;

  for (const msg of messages) {
    const isBuyer = msg.from === "buyer" || msg.from === "Buyer";
    const bubbleColor = isBuyer ? "#0f3460" : "#1a1a40";
    const nameColor = isBuyer ? "#e94560" : "#48c9b0";
    const align = isBuyer ? padding : width * 0.25;
    const bubbleWidth = width * 0.7;

    // Sender name + timestamp
    svg += `<text x="${align + 10}" y="${y + 14}" font-family="Arial, sans-serif" font-size="11" fill="${nameColor}">${escXml(msg.from)}</text>`;
    svg += `<text x="${align + bubbleWidth - 50}" y="${y + 14}" font-family="Arial, sans-serif" font-size="9" fill="#666">${escXml(msg.time || "")}</text>`;
    y += 20;

    // Message text lines
    const textLines = wrapSvgText(msg.text, 55);
    const bubbleH = textLines.length * lineHeight + 16;

    svg += `<rect x="${align}" y="${y}" width="${bubbleWidth}" height="${bubbleH}" rx="8" fill="${bubbleColor}"/>`;
    for (let i = 0; i < textLines.length; i++) {
      svg += `<text x="${align + 12}" y="${y + 18 + i * lineHeight}" font-family="Arial, sans-serif" font-size="13" fill="#d0d0d0">${escXml(textLines[i])}</text>`;
    }
    y += bubbleH + 10;
  }

  svg += `</svg>`;
  return Buffer.from(svg, "utf-8");
}

function wrapSvgText(text, maxChars) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > maxChars && line) {
      lines.push(line.trim());
      line = word;
    } else {
      line = line ? line + " " + word : word;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function escXml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function generateCSV(headers, rows) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(row.map(cell => {
      const s = String(cell);
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","));
  }
  return Buffer.from(lines.join("\n"), "utf-8");
}

// ── Upload Helper ────────────────────────────────────────────────────────────

async function uploadFile(path, buffer, contentType) {
  const file = bucket.file(path);
  await file.save(buffer, { metadata: { contentType } });
  await file.makePublic();
  return `https://storage.googleapis.com/${storageBucket}/${path}`;
}

// ── Scenario Definitions ─────────────────────────────────────────────────────

const SCENARIOS = [
  // ─── 1. Logo Design Non-Delivery ───────────────────────────────
  {
    title: "Freelance Logo Design — Wrong Deliverable",
    expectedRuling: "BuyerWins",
    difficulty: "standard",
    analysisPrompt: "Analyze the contract, chat logs, and payment records. Identify whether the seller fulfilled the contract terms for the logo design. Note any discrepancies between what was agreed and what was delivered.",
    expectedKeyFacts: [
      "contract specifies vector AI and SVG formats",
      "seller delivered JPEG only",
      "buyer requested corrections twice",
      "seller refused to provide source files",
      "payment of 500 LOB was completed upfront",
      "delivery deadline was met but format was wrong",
    ],
    evidence: [
      {
        name: "Logo_Design_Contract.pdf",
        type: "application/pdf",
        generator: () => generatePDF("Logo Design Service Contract", [
          { heading: "PARTIES", body: "This contract is between Alex Rivera (Buyer) and PixelForge Studio (Seller).\nContract Date: January 15, 2026" },
          { heading: "SCOPE OF WORK", body: "Seller agrees to design a professional logo for Buyer's brand 'NovaTech Solutions'.\n\nDeliverables:\n- 3 initial logo concepts within 5 business days\n- 2 rounds of revisions on chosen concept\n- Final delivery in vector formats: AI, SVG, EPS\n- Additional formats: PNG (transparent), JPEG (white background)\n- Brand style guide document" },
          { heading: "COMPENSATION", body: "Total fee: 500 LOB tokens, payable via LOBSTR escrow upon contract creation.\nFunds released upon buyer confirmation of satisfactory delivery." },
          { heading: "TIMELINE", body: "Initial concepts: January 20, 2026\nRevisions: January 25, 2026\nFinal delivery: January 30, 2026" },
          { heading: "INTELLECTUAL PROPERTY", body: "All rights to the final logo design transfer to Buyer upon full payment. Seller retains right to display work in portfolio." },
          { heading: "DELIVERY REQUIREMENTS", body: "All files must be delivered via the LOBSTR platform. Source files (AI format) are REQUIRED as part of the deliverable package. Failure to deliver source files constitutes incomplete delivery." },
        ]),
      },
      {
        name: "Chat_Log_Screenshot.svg",
        type: "image/svg+xml",
        generator: () => generateChatSVG("LOBSTR Chat — Job #4821", [
          { from: "Buyer", text: "Hey, I received the files but I only see JPEGs. Where are the vector files (AI, SVG)?", time: "Jan 30" },
          { from: "Seller", text: "The JPEG is high resolution, 4000x4000px. Should be good enough for any use.", time: "Jan 30" },
          { from: "Buyer", text: "The contract specifically says AI and SVG formats. I need vectors for print materials. Can you send them?", time: "Jan 30" },
          { from: "Seller", text: "I don't usually give out source files. The JPEG works fine.", time: "Jan 31" },
          { from: "Buyer", text: "This was explicitly in the contract. I need the source files to scale the logo for billboards.", time: "Jan 31" },
          { from: "Seller", text: "Look, I delivered the logo. It looks great. I'm not sending AI files, those are my working files.", time: "Jan 31" },
          { from: "Buyer", text: "I'm opening a dispute. The contract says vector formats are required deliverables.", time: "Feb 1" },
        ]),
      },
      {
        name: "Payment_Record.csv",
        type: "text/csv",
        generator: () => generateCSV(
          ["Date", "Description", "Amount (LOB)", "From", "To", "Status", "TX Hash"],
          [
            ["2026-01-15", "Escrow deposit — Logo Design Job #4821", "500.00", "Alex Rivera (Buyer)", "LOBSTR Escrow", "Confirmed", "0xabc123...def456"],
            ["2026-01-30", "Delivery submitted by seller", "—", "PixelForge Studio", "—", "Pending Review", "—"],
            ["2026-02-01", "Dispute filed by buyer", "—", "Alex Rivera", "—", "Disputed", "0x789abc...123def"],
          ]
        ),
      },
    ],
    mcQuestions: [
      { question: "According to the contract, which file formats were required as deliverables?", options: ["JPEG and PNG only", "AI, SVG, EPS, PNG, and JPEG", "PDF and PNG", "Any format the seller chooses"], correctIndex: 1 },
      { question: "What did the seller actually deliver?", options: ["AI and SVG files", "All required formats", "JPEG files only", "PNG files with transparent background"], correctIndex: 2 },
      { question: "What was the seller's reason for not providing vector files?", options: ["Technical difficulties prevented export", "The buyer didn't pay for source files", "They consider AI files as personal working files", "The contract didn't specify formats"], correctIndex: 2 },
      { question: "How many times did the buyer request the vector files?", options: ["Once", "Twice", "Three times", "Never"], correctIndex: 1 },
      { question: "What does the contract say about source file delivery?", options: ["Source files are optional", "Source files are required as part of the deliverable package", "Source files cost extra", "The contract doesn't mention source files"], correctIndex: 1 },
    ],
  },

  // ─── 2. Report Partial Delivery ────────────────────────────────
  {
    title: "Research Report — Incomplete Delivery (3 of 5 Sections)",
    expectedRuling: "BuyerWins",
    difficulty: "standard",
    analysisPrompt: "Review the statement of work, the delivered report contents, and the invoice. Determine if the seller fulfilled the contracted scope. Pay attention to the number of sections agreed vs delivered.",
    expectedKeyFacts: [
      "SOW specifies 5 sections with specific topics",
      "only 3 sections were delivered",
      "missing sections 4 and 5 on regulatory analysis and market forecast",
      "seller claims scope was changed verbally",
      "no written record of scope change",
      "buyer never agreed to reduce scope",
      "invoice shows full amount billed for 5 sections",
    ],
    evidence: [
      {
        name: "Statement_of_Work.pdf",
        type: "application/pdf",
        generator: () => generatePDF("Statement of Work — Market Research Report", [
          { heading: "PROJECT", body: "Comprehensive Market Research Report for DeFi Lending Protocols\nClient: Meridian Capital (Buyer)\nConsultant: DataScope Analytics (Seller)" },
          { heading: "DELIVERABLES", body: "A written report consisting of 5 sections:\n\n1. Executive Summary & Methodology (5-7 pages)\n2. Current Market Landscape — top 15 DeFi lending protocols (10-12 pages)\n3. Competitive Analysis & Feature Comparison (8-10 pages)\n4. Regulatory Environment Analysis across US, EU, and Asia (8-10 pages)\n5. Market Forecast & Growth Projections for 2026-2028 (6-8 pages)\n\nTotal estimated length: 37-47 pages\nFormat: PDF with charts and data tables" },
          { heading: "COMPENSATION", body: "Total: 2,000 LOB tokens\nPayment: Full amount escrowed at job creation\nRelease: Upon buyer confirmation of complete delivery" },
          { heading: "TIMELINE", body: "Start: February 1, 2026\nDraft delivery: February 14, 2026\nFinal delivery (after revisions): February 21, 2026" },
          { heading: "ACCEPTANCE CRITERIA", body: "All 5 sections must be delivered. Each section must contain original research and data. Copy-pasted or AI-generated filler content is not acceptable. Buyer has 5 business days to review and request one round of revisions." },
        ]),
      },
      {
        name: "Delivered_Report_TOC.pdf",
        type: "application/pdf",
        generator: () => generatePDF("DeFi Lending Market Research Report — DELIVERED", [
          { heading: "TABLE OF CONTENTS", body: "Section 1: Executive Summary & Methodology .............. pages 1-6\nSection 2: Current Market Landscape ........................ pages 7-18\nSection 3: Competitive Analysis & Feature Comparison ....... pages 19-27\n\n[END OF DOCUMENT — 27 pages total]" },
          { heading: "NOTE FROM CONSULTANT", body: "Hi Meridian team,\n\nPlease find the completed report attached. The three sections cover the core analysis you need. I believe this captures the essential market intelligence.\n\nBest regards,\nDataScope Analytics" },
          { heading: "MISSING SECTIONS", body: "Section 4: Regulatory Environment Analysis — NOT INCLUDED\nSection 5: Market Forecast & Growth Projections — NOT INCLUDED" },
        ]),
      },
      {
        name: "Invoice_Full_Amount.csv",
        type: "text/csv",
        generator: () => generateCSV(
          ["Invoice #", "Date", "Description", "Quantity", "Unit Price (LOB)", "Total (LOB)"],
          [
            ["INV-2026-0042", "2026-02-14", "Section 1: Executive Summary", "1", "400", "400"],
            ["INV-2026-0042", "2026-02-14", "Section 2: Market Landscape", "1", "400", "400"],
            ["INV-2026-0042", "2026-02-14", "Section 3: Competitive Analysis", "1", "400", "400"],
            ["INV-2026-0042", "2026-02-14", "Section 4: Regulatory Analysis", "1", "400", "400"],
            ["INV-2026-0042", "2026-02-14", "Section 5: Market Forecast", "1", "400", "400"],
            ["", "", "", "", "TOTAL", "2,000"],
          ]
        ),
      },
    ],
    mcQuestions: [
      { question: "How many sections were specified in the Statement of Work?", options: ["3", "4", "5", "7"], correctIndex: 2 },
      { question: "How many sections did the seller actually deliver?", options: ["2", "3", "4", "5"], correctIndex: 1 },
      { question: "Which sections were missing from the delivery?", options: ["Sections 1 and 2", "Sections 3 and 4", "Sections 4 and 5", "Section 5 only"], correctIndex: 2 },
      { question: "What did the invoice bill for?", options: ["Only the 3 delivered sections", "All 5 sections at full price", "A prorated amount for partial delivery", "Nothing — invoice was not submitted"], correctIndex: 1 },
      { question: "Was there written documentation of any scope change?", options: ["Yes, the buyer agreed to reduce scope via email", "Yes, the SOW was formally amended", "No written record of any scope change exists", "The SOW allows flexible delivery"], correctIndex: 2 },
    ],
  },

  // ─── 3. False Non-Delivery Claim ───────────────────────────────
  {
    title: "Web Scraping Service — Buyer Claims Non-Delivery (False)",
    expectedRuling: "SellerWins",
    difficulty: "standard",
    analysisPrompt: "Examine the delivery receipt, system logs, and chat history. Determine if the seller actually delivered the work. Look for evidence that the buyer received and accessed the deliverables.",
    expectedKeyFacts: [
      "seller uploaded deliverable to LOBSTR platform",
      "system logs show buyer downloaded the file",
      "download occurred within hours of delivery",
      "buyer's IP address matches the download",
      "buyer filed dispute 3 days after downloading",
      "chat shows buyer acknowledged receiving a file",
      "dataset contains all 10000 records as contracted",
    ],
    evidence: [
      {
        name: "Delivery_Receipt.pdf",
        type: "application/pdf",
        generator: () => generatePDF("LOBSTR Platform — Delivery Confirmation", [
          { heading: "JOB DETAILS", body: "Job ID: #5847\nService: Web Scraping — E-commerce Product Data\nBuyer: Chen Wei\nSeller: ScrapeMaster Pro" },
          { heading: "DELIVERY RECORD", body: "File delivered: ecommerce_products_10k.csv (4.2 MB)\nDelivery timestamp: 2026-02-10 14:32:00 UTC\nDelivery method: LOBSTR platform file upload\nFile hash (SHA-256): a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9..." },
          { heading: "DOWNLOAD LOG", body: "Download #1: 2026-02-10 16:45:22 UTC — IP: 103.42.xx.xx (Singapore)\nDownload #2: 2026-02-10 18:12:05 UTC — IP: 103.42.xx.xx (Singapore)\nBuyer's registered IP region: Singapore" },
          { heading: "FILE CONTENTS SUMMARY", body: "Total records: 10,247\nColumns: product_name, price, category, url, rating, review_count, seller_name, availability\nData sources: Amazon, eBay, Shopify stores\nDate range: January 2026 data" },
        ]),
      },
      {
        name: "Chat_History.svg",
        type: "image/svg+xml",
        generator: () => generateChatSVG("LOBSTR Chat — Job #5847", [
          { from: "Seller", text: "Data scraping is complete. I've uploaded the CSV with 10,247 product records to the platform. All columns as specified.", time: "Feb 10" },
          { from: "Buyer", text: "Got it, let me check the file.", time: "Feb 10" },
          { from: "Buyer", text: "The file downloaded fine. I'll review the data quality over the next day or two.", time: "Feb 10" },
          { from: "Seller", text: "Sounds good! Let me know if you have any questions about the data.", time: "Feb 10" },
          { from: "Buyer", text: "Actually I changed my mind on this project. I don't need this data anymore.", time: "Feb 13" },
          { from: "Seller", text: "I already completed the work and delivered it. The data matches the contract spec.", time: "Feb 13" },
          { from: "Buyer", text: "I'm disputing this. The data was never delivered properly.", time: "Feb 13" },
        ]),
      },
      {
        name: "Platform_Access_Log.csv",
        type: "text/csv",
        generator: () => generateCSV(
          ["Timestamp (UTC)", "Event", "User", "IP Address", "Details"],
          [
            ["2026-02-10 14:32:00", "File Upload", "ScrapeMaster Pro (Seller)", "45.67.xx.xx", "ecommerce_products_10k.csv — 4.2 MB"],
            ["2026-02-10 16:45:22", "File Download", "Chen Wei (Buyer)", "103.42.xx.xx", "ecommerce_products_10k.csv — full download"],
            ["2026-02-10 18:12:05", "File Download", "Chen Wei (Buyer)", "103.42.xx.xx", "ecommerce_products_10k.csv — second download"],
            ["2026-02-13 09:15:33", "Dispute Filed", "Chen Wei (Buyer)", "103.42.xx.xx", "Reason: Non-delivery"],
          ]
        ),
      },
    ],
    mcQuestions: [
      { question: "When did the seller upload the deliverable?", options: ["February 8", "February 10", "February 13", "February 15"], correctIndex: 1 },
      { question: "Did the buyer download the delivered file?", options: ["No, the file was never accessed", "Yes, the buyer downloaded it twice", "The logs are inconclusive", "Only the seller downloaded it"], correctIndex: 1 },
      { question: "What did the buyer say in chat after receiving the file?", options: ["The data is wrong", "I never received anything", "The file downloaded fine, I'll review it", "The format is incorrect"], correctIndex: 2 },
      { question: "When did the buyer file the dispute relative to downloading the file?", options: ["Same day", "1 day later", "3 days later", "1 week later"], correctIndex: 2 },
      { question: "What reason did the buyer give in the chat for wanting to cancel?", options: ["Data quality was poor", "Format was wrong", "Changed mind and doesn't need the data anymore", "Seller missed the deadline"], correctIndex: 2 },
    ],
  },

  // ─── 4. Website — Bug-Ridden Delivery ──────────────────────────
  {
    title: "E-commerce Website — Delivered with Critical Bugs",
    expectedRuling: "BuyerWins",
    difficulty: "standard",
    analysisPrompt: "Review the contract requirements, bug report, and the seller's QA checklist. Assess whether the delivery meets the acceptance criteria specified in the contract. Focus on the severity of bugs found.",
    expectedKeyFacts: [
      "contract requires working checkout flow",
      "checkout process crashes on payment step",
      "3 of 5 core pages return errors",
      "seller's QA checklist was not actually performed",
      "contact form submits but data is lost",
      "mobile responsive design was required but not implemented",
      "seller acknowledged bugs but refused to fix without extra payment",
    ],
    evidence: [
      {
        name: "Website_Dev_Contract.pdf",
        type: "application/pdf",
        generator: () => generatePDF("Website Development Agreement", [
          { heading: "PROJECT", body: "E-commerce website for GreenLeaf Organics\nBuyer: GreenLeaf Organics (Sarah Mitchell)\nSeller: WebCraft Dev (Raj Patel)" },
          { heading: "REQUIREMENTS", body: "5 core pages: Home, Shop, Product Detail, Cart/Checkout, Contact\nFull checkout flow with payment integration (Stripe)\nMobile-responsive design (must work on iPhone, Android)\nContact form with email notifications\nProduct search and category filtering\nAdmin panel for inventory management" },
          { heading: "ACCEPTANCE CRITERIA", body: "1. All 5 core pages load without errors\n2. Checkout flow completes end-to-end (add to cart → payment → confirmation)\n3. Mobile responsive on screens 375px and above\n4. Contact form successfully sends emails\n5. No critical (P0) or high (P1) bugs at delivery\n\nBuyer will perform acceptance testing within 3 days of delivery." },
          { heading: "PAYMENT", body: "Total: 3,000 LOB tokens, escrowed on LOBSTR" },
        ]),
      },
      {
        name: "Bug_Report.pdf",
        type: "application/pdf",
        generator: () => generatePDF("Bug Report — GreenLeaf Website Acceptance Testing", [
          { heading: "TESTING DATE: February 18, 2026", body: "Tested by: Sarah Mitchell (Buyer)\nEnvironment: Chrome 122, iPhone 15 Safari, Pixel 8 Chrome" },
          { heading: "BUG #1 — CRITICAL (P0)", body: "Page: Checkout\nDescription: Clicking 'Complete Purchase' throws a JavaScript error and the page goes blank. Payment is never processed. Stripe integration appears to be using test keys, not live keys.\nReproducible: 100% of the time" },
          { heading: "BUG #2 — CRITICAL (P0)", body: "Page: Shop\nDescription: Product listing page returns a 500 Internal Server Error when more than 10 products are loaded. Only works with 5 or fewer products in the database.\nReproducible: 100% when >10 products exist" },
          { heading: "BUG #3 — HIGH (P1)", body: "Page: Contact\nDescription: Form submits successfully (shows 'Thank you' message) but no email is ever received. Backend email service is not configured.\nReproducible: 100%" },
          { heading: "BUG #4 — HIGH (P1)", body: "All Pages: Mobile responsive design not implemented. On iPhone (375px width), text overflows, buttons are unclickable, and the navigation menu doesn't open.\nReproducible: 100% on all mobile devices" },
          { heading: "BUG #5 — MEDIUM (P2)", body: "Page: Product Detail\nDescription: Product images don't load. All show broken image icons. Image paths point to localhost URLs.\nReproducible: 100%" },
          { heading: "SUMMARY", body: "2 Critical (P0) bugs, 2 High (P1) bugs, 1 Medium (P2) bug.\nThe website is non-functional for its primary purpose (selling products online)." },
        ]),
      },
      {
        name: "Seller_QA_Checklist.svg",
        type: "image/svg+xml",
        generator: () => generateChatSVG("Chat — QA Discussion", [
          { from: "Seller", text: "Website is delivered! I tested everything and it all works. Here's my QA checklist — all items passed.", time: "Feb 17" },
          { from: "Buyer", text: "Raj, I found 5 bugs. The checkout doesn't work at all. You're using Stripe TEST keys. And the site isn't mobile responsive.", time: "Feb 18" },
          { from: "Seller", text: "Those are minor issues. The site is 90% done. Mobile responsiveness is extra work — that'll cost 1,000 more LOB.", time: "Feb 18" },
          { from: "Buyer", text: "Mobile responsive was explicitly in the contract requirements. And a non-working checkout is not a 'minor issue' for an e-commerce site.", time: "Feb 18" },
          { from: "Seller", text: "I delivered a complete website. Bug fixes are maintenance, not part of the original scope.", time: "Feb 19" },
          { from: "Buyer", text: "The contract says no P0 or P1 bugs at delivery. There are 4. I'm filing a dispute.", time: "Feb 19" },
        ]),
      },
    ],
    mcQuestions: [
      { question: "How many critical (P0) bugs were found?", options: ["0", "1", "2", "3"], correctIndex: 2 },
      { question: "Was mobile responsiveness part of the original contract?", options: ["No, it was a verbal request", "Yes, explicitly listed in requirements", "It was mentioned but marked as optional", "The contract didn't specify device compatibility"], correctIndex: 1 },
      { question: "What was wrong with the Stripe integration?", options: ["It was not integrated at all", "It used test keys instead of live keys", "It charged incorrect amounts", "It only worked with one card type"], correctIndex: 1 },
      { question: "How did the seller respond to the bug reports?", options: ["Agreed to fix all bugs immediately", "Acknowledged bugs and requested extra payment for fixes", "Denied all bugs existed", "Stopped responding entirely"], correctIndex: 1 },
      { question: "What does the contract's acceptance criteria say about bugs?", options: ["Bugs are expected and acceptable", "No critical (P0) or high (P1) bugs at delivery", "Only P0 bugs are unacceptable", "Buyer must fix bugs themselves"], correctIndex: 1 },
    ],
  },

  // ─── 5. Scope Creep — Seller Delivered Original Scope ──────────
  {
    title: "Mobile App MVP — Buyer Added Features After Contract",
    expectedRuling: "SellerWins",
    difficulty: "standard",
    analysisPrompt: "Compare the original contract scope with the buyer's dispute claims. Analyze whether the seller delivered what was originally agreed, and whether the additional features were part of the original scope or added later.",
    expectedKeyFacts: [
      "original contract specifies 3 screens: login, feed, profile",
      "seller delivered all 3 screens working correctly",
      "buyer requested push notifications after contract was signed",
      "buyer requested dark mode after contract was signed",
      "additional requests were made via chat, not contract amendment",
      "seller offered to build additions for extra payment",
      "buyer refused to pay more and filed dispute",
    ],
    evidence: [
      {
        name: "App_Development_Contract.pdf",
        type: "application/pdf",
        generator: () => generatePDF("Mobile App MVP — Development Contract", [
          { heading: "SCOPE", body: "Develop a social media mobile app MVP (React Native) with 3 core screens:\n\n1. Login/Registration screen with email authentication\n2. Content Feed screen with infinite scroll\n3. User Profile screen with edit capability\n\nPlatform: iOS and Android (React Native)\nNo backend development — buyer provides API endpoints\nNo push notifications, analytics, or advanced features in MVP scope" },
          { heading: "PAYMENT", body: "1,500 LOB tokens via LOBSTR escrow" },
          { heading: "EXPLICITLY EXCLUDED", body: "The following are NOT part of this contract:\n- Push notifications\n- Dark mode / theme switching\n- Chat / messaging features\n- Payment integration\n- Admin dashboard\n\nThese can be contracted separately." },
        ]),
      },
      {
        name: "Feature_Requests_Chat.svg",
        type: "image/svg+xml",
        generator: () => generateChatSVG("LOBSTR Chat — Job #6203", [
          { from: "Seller", text: "Login, Feed, and Profile screens are done. Everything works as specified. Sending the build now.", time: "Feb 12" },
          { from: "Buyer", text: "Looks good! But can you also add push notifications? Every app needs those.", time: "Feb 12" },
          { from: "Seller", text: "Push notifications weren't in the contract scope. I can add them for 400 LOB in a separate job.", time: "Feb 12" },
          { from: "Buyer", text: "Come on, it should be included. Also I need dark mode.", time: "Feb 13" },
          { from: "Seller", text: "Those are both explicitly excluded in our contract under 'EXPLICITLY EXCLUDED'. Happy to do them as add-ons.", time: "Feb 13" },
          { from: "Buyer", text: "No, a real MVP should have these. I'm not paying extra. I'm disputing.", time: "Feb 14" },
        ]),
      },
      {
        name: "Delivery_Acceptance_Test.csv",
        type: "text/csv",
        generator: () => generateCSV(
          ["Feature", "Contracted", "Delivered", "Working", "Notes"],
          [
            ["Login/Registration", "Yes", "Yes", "Yes", "Email auth working on iOS and Android"],
            ["Content Feed", "Yes", "Yes", "Yes", "Infinite scroll, image loading, pull to refresh"],
            ["User Profile", "Yes", "Yes", "Yes", "View and edit profile, avatar upload"],
            ["Push Notifications", "No (excluded)", "No", "N/A", "Buyer requested post-contract"],
            ["Dark Mode", "No (excluded)", "No", "N/A", "Buyer requested post-contract"],
          ]
        ),
      },
    ],
    mcQuestions: [
      { question: "How many screens were specified in the original contract?", options: ["2", "3", "5", "7"], correctIndex: 1 },
      { question: "Were push notifications part of the original scope?", options: ["Yes, they were in the requirements", "They were listed as a stretch goal", "No, they were explicitly excluded", "The contract didn't mention them"], correctIndex: 2 },
      { question: "Did the seller deliver all contracted features?", options: ["No, core features were missing", "Yes, all 3 screens were delivered and working", "Only 2 of 3 screens worked", "The app was never delivered"], correctIndex: 1 },
      { question: "How did the seller respond to the additional feature requests?", options: ["Ignored them completely", "Agreed to add them for free", "Offered to build them as separate paid work", "Said they were impossible to implement"], correctIndex: 2 },
      { question: "What was the buyer's reason for filing the dispute?", options: ["Core features were broken", "App crashed on startup", "Seller refused to add non-contracted features for free", "Seller missed the deadline"], correctIndex: 2 },
    ],
  },

  // ─── 6. Missed Deadline ────────────────────────────────────────
  {
    title: "Marketing Campaign — 3-Week Late Delivery",
    expectedRuling: "BuyerWins",
    difficulty: "standard",
    analysisPrompt: "Analyze the contract timeline, delivery dates, and the impact of the late delivery. Consider whether the delay was communicated and whether the buyer suffered damages from the late delivery.",
    expectedKeyFacts: [
      "contract deadline was February 1",
      "seller delivered February 22 without prior notice",
      "buyer's product launch was February 5",
      "marketing materials were useless after launch date",
      "seller did not communicate any delays",
      "buyer hired emergency replacement on February 3",
      "no force majeure or extension clause was invoked",
    ],
    evidence: [
      {
        name: "Campaign_Contract.pdf",
        type: "application/pdf",
        generator: () => generatePDF("Marketing Campaign Contract", [
          { heading: "SERVICE", body: "Design and copywriting for product launch marketing campaign.\n\nDeliverables: 10 social media graphics, 3 email templates, 1 landing page design\nBuyer: TechPulse Inc.\nSeller: Creative Momentum Agency" },
          { heading: "CRITICAL DEADLINE", body: "All materials must be delivered by February 1, 2026.\n\nThis deadline is FIRM — the buyer's product launches on February 5, 2026. Late delivery renders the materials useless for the launch window.\n\nSeller acknowledges the time-sensitive nature of this project." },
          { heading: "PAYMENT", body: "1,800 LOB tokens, escrowed on LOBSTR" },
          { heading: "LATE DELIVERY", body: "If materials are not delivered by February 1, buyer may cancel the contract and receive a full refund. No partial payment for late delivery." },
        ]),
      },
      {
        name: "Timeline_Record.csv",
        type: "text/csv",
        generator: () => generateCSV(
          ["Date", "Event", "Actor", "Notes"],
          [
            ["2026-01-15", "Contract signed, escrow funded", "Both parties", "Deadline: Feb 1"],
            ["2026-01-22", "Buyer: Status check", "Buyer", "Asked for progress update"],
            ["2026-01-22", "Seller: Everything on track!", "Seller", "No preview shared"],
            ["2026-02-01", "DEADLINE — No delivery", "—", "Seller did not deliver or communicate"],
            ["2026-02-02", "Buyer: Where are the materials?", "Buyer", "No response from seller"],
            ["2026-02-03", "Buyer hired emergency replacement", "Buyer", "Paid 2x for rush delivery"],
            ["2026-02-05", "Product launch (with replacement materials)", "Buyer", "Launch proceeded"],
            ["2026-02-22", "Seller delivers materials", "Seller", "21 days late, no explanation"],
          ]
        ),
      },
      {
        name: "Chat_Attempts.svg",
        type: "image/svg+xml",
        generator: () => generateChatSVG("LOBSTR Chat — Job #3920", [
          { from: "Buyer", text: "Hey! Today is the deadline (Feb 1). Are the materials ready?", time: "Feb 1" },
          { from: "Buyer", text: "Hello? I really need these files. Our launch is in 4 days.", time: "Feb 2" },
          { from: "Buyer", text: "No response in 2 days. I'm hiring a replacement agency. This is unacceptable.", time: "Feb 3" },
          { from: "Seller", text: "Sorry, was dealing with personal stuff. Here are the final materials!", time: "Feb 22" },
          { from: "Buyer", text: "This is 3 weeks late. Our launch already happened on Feb 5. These are useless to us now. Filing a dispute.", time: "Feb 22" },
        ]),
      },
    ],
    mcQuestions: [
      { question: "What was the contracted delivery deadline?", options: ["January 22", "February 1", "February 5", "February 22"], correctIndex: 1 },
      { question: "When did the seller actually deliver?", options: ["February 1", "February 5", "February 15", "February 22"], correctIndex: 3 },
      { question: "Did the seller communicate about the delay beforehand?", options: ["Yes, they warned about a 1-week delay", "Yes, they requested a deadline extension", "No, they went silent and delivered 3 weeks late", "They communicated daily about progress"], correctIndex: 2 },
      { question: "What happened to the buyer's product launch?", options: ["It was postponed to wait for the seller", "It proceeded with replacement materials from another agency", "It was cancelled entirely", "It used the seller's late materials"], correctIndex: 1 },
      { question: "What does the contract say about late delivery?", options: ["Late delivery incurs a 10% penalty", "Buyer may cancel and receive a full refund", "Seller gets an automatic 2-week extension", "Late delivery is acceptable with notice"], correctIndex: 1 },
    ],
  },

  // ─── 7. Data Scraping — Incomplete Results ─────────────────────
  {
    title: "Lead Generation Data — Only 60% of Records Delivered",
    expectedRuling: "BuyerWins",
    difficulty: "standard",
    analysisPrompt: "Review the data specification, delivery stats, and the seller's explanation. Determine if the delivery meets the quantitative requirements of the contract. Assess the validity of the seller's explanation.",
    expectedKeyFacts: [
      "contract requires 50000 verified business leads",
      "seller delivered only 31204 leads",
      "many leads have missing email addresses",
      "seller blames data source access restrictions",
      "contract does not include force majeure for data access issues",
      "seller did not notify buyer of shortfall before delivery",
      "seller billed for full 50000 leads",
    ],
    evidence: [
      {
        name: "Data_Contract.pdf",
        type: "application/pdf",
        generator: () => generatePDF("Lead Generation Data Contract", [
          { heading: "DELIVERABLE", body: "50,000 verified B2B business leads for US-based SaaS companies.\n\nEach record MUST contain:\n- Company name\n- Contact person (first + last name)\n- Verified email address\n- Phone number\n- Company size (employees)\n- Industry vertical" },
          { heading: "QUALITY REQUIREMENTS", body: "Email verification rate: minimum 95%\nData completeness: all 6 fields populated for each record\nNo duplicate entries\nData freshness: collected within the last 90 days" },
          { heading: "PAYMENT", body: "800 LOB tokens for 50,000 leads ($0.016 per lead)" },
        ]),
      },
      {
        name: "Delivery_Stats.csv",
        type: "text/csv",
        generator: () => generateCSV(
          ["Metric", "Contracted", "Delivered", "Percentage"],
          [
            ["Total records", "50000", "31204", "62.4%"],
            ["Records with verified email", "47500 (95%)", "22102", "70.8% of delivered"],
            ["Records with all 6 fields", "50000", "18732", "60.0% of delivered"],
            ["Duplicate records found", "0", "847", "2.7% of delivered"],
            ["Unique valid leads", "50000", "17885", "35.8% of contracted"],
          ]
        ),
      },
      {
        name: "Seller_Explanation_Chat.svg",
        type: "image/svg+xml",
        generator: () => generateChatSVG("LOBSTR Chat — Job #7112", [
          { from: "Seller", text: "Here's the lead data. I ran into some issues with LinkedIn and ZoomInfo access being restricted. Could only get about 31K leads.", time: "Feb 15" },
          { from: "Buyer", text: "The contract is for 50,000 leads. This is only 62%. And many are missing email addresses.", time: "Feb 15" },
          { from: "Seller", text: "Data access is unpredictable. I delivered what I could. 31K is still a lot of data.", time: "Feb 16" },
          { from: "Buyer", text: "You should have told me BEFORE delivery, not after. I needed 50K for my outreach campaign.", time: "Feb 16" },
        ]),
      },
    ],
    mcQuestions: [
      { question: "How many leads were contracted?", options: ["10,000", "25,000", "50,000", "100,000"], correctIndex: 2 },
      { question: "How many leads were actually delivered?", options: ["50,000", "47,500", "31,204", "17,885"], correctIndex: 2 },
      { question: "What percentage of delivered records had all required fields?", options: ["95%", "80%", "60%", "45%"], correctIndex: 2 },
      { question: "Did the seller notify the buyer about the shortfall before delivery?", options: ["Yes, 1 week before", "Yes, the day before", "No, the buyer found out upon delivery", "The seller sent daily progress updates"], correctIndex: 2 },
      { question: "What was the seller's explanation for the shortfall?", options: ["Technical server failure", "Data source access was restricted", "The buyer provided wrong specifications", "The project was more complex than estimated"], correctIndex: 1 },
    ],
  },

  // ─── 8. API Integration — Works as Specified ───────────────────
  {
    title: "API Integration — Buyer Claims Malfunction (Works Fine)",
    expectedRuling: "SellerWins",
    difficulty: "standard",
    analysisPrompt: "Analyze the API specifications, test results, and error logs. Determine if the API integration works as contracted. Pay attention to whether the buyer's reported issues stem from the integration itself or from their own environment.",
    expectedKeyFacts: [
      "API passes all 47 contracted endpoint tests",
      "buyer's errors are caused by their own server misconfiguration",
      "401 errors are from expired buyer API keys not the integration",
      "independent test suite confirms all endpoints work",
      "seller provided documentation for all endpoints",
      "buyer did not update their API keys as instructed",
    ],
    evidence: [
      {
        name: "API_Test_Results.csv",
        type: "text/csv",
        generator: () => generateCSV(
          ["Endpoint", "Method", "Expected Status", "Actual Status", "Response Time (ms)", "Result"],
          [
            ["/api/v1/auth/login", "POST", "200", "200", "145", "PASS"],
            ["/api/v1/users", "GET", "200", "200", "89", "PASS"],
            ["/api/v1/users/:id", "GET", "200", "200", "92", "PASS"],
            ["/api/v1/products", "GET", "200", "200", "156", "PASS"],
            ["/api/v1/products", "POST", "201", "201", "203", "PASS"],
            ["/api/v1/orders", "GET", "200", "200", "178", "PASS"],
            ["/api/v1/orders", "POST", "201", "201", "312", "PASS"],
            ["/api/v1/payments/process", "POST", "200", "200", "445", "PASS"],
            ["... (39 more endpoints)", "—", "—", "—", "—", "ALL PASS"],
            ["TOTAL", "47 endpoints", "47 passed", "0 failed", "avg 198ms", "100% PASS"],
          ]
        ),
      },
      {
        name: "Error_Analysis.pdf",
        type: "application/pdf",
        generator: () => generatePDF("Error Analysis — Buyer's Reported Issues", [
          { heading: "BUYER'S COMPLAINT", body: "Buyer reports: 'API returns 401 Unauthorized on every request. Nothing works.'" },
          { heading: "ROOT CAUSE ANALYSIS", body: "Seller investigated the buyer's server logs (shared by buyer).\n\nFinding: The buyer's application is sending API requests with an expired API key from their previous provider. The integration documentation (delivered with the API) clearly states:\n\n'Update your API_KEY and API_SECRET in your .env file with the new credentials provided in the setup email.'\n\nThe buyer's .env file still contains the old API key: 'sk_old_xxx...xxx'\nThe new API key was provided on delivery day: 'sk_new_yyy...yyy'" },
          { heading: "INDEPENDENT VERIFICATION", body: "Seller ran the full test suite using the correct credentials: 47/47 endpoints pass.\nSeller ran the same test suite using the buyer's expired key: 47/47 return 401.\n\nConclusion: The integration works correctly. The buyer has not updated their API credentials." },
        ]),
      },
      {
        name: "Setup_Chat.svg",
        type: "image/svg+xml",
        generator: () => generateChatSVG("LOBSTR Chat — Job #8901", [
          { from: "Seller", text: "API integration is complete. I've emailed you the new API credentials and the setup guide. Make sure to update your .env file.", time: "Feb 8" },
          { from: "Buyer", text: "OK got it. I'll set it up tomorrow.", time: "Feb 8" },
          { from: "Buyer", text: "The API doesn't work. Every request returns 401 Unauthorized.", time: "Feb 10" },
          { from: "Seller", text: "Did you update your API keys in the .env file? The setup guide explains this on page 1.", time: "Feb 10" },
          { from: "Buyer", text: "I shouldn't have to configure anything. It should just work.", time: "Feb 10" },
          { from: "Seller", text: "You need to use the new API keys I sent. Your old keys are expired. That's why you're getting 401s.", time: "Feb 10" },
          { from: "Buyer", text: "This is broken. I'm filing a dispute.", time: "Feb 11" },
        ]),
      },
    ],
    mcQuestions: [
      { question: "How many API endpoints passed the test suite?", options: ["0 of 47", "23 of 47", "45 of 47", "47 of 47"], correctIndex: 3 },
      { question: "What was causing the buyer's 401 errors?", options: ["The API integration was broken", "The server was down", "The buyer was using expired API keys", "The endpoints had wrong URLs"], correctIndex: 2 },
      { question: "Did the seller provide setup documentation?", options: ["No documentation was delivered", "Only a brief README", "Yes, including credential setup instructions", "Documentation was promised but not delivered"], correctIndex: 2 },
      { question: "What did the independent verification show?", options: ["The API had intermittent failures", "All endpoints work with correct credentials", "Half the endpoints were broken", "The API was never deployed"], correctIndex: 1 },
      { question: "What was the buyer's response to updating API keys?", options: ["They updated keys and it worked", "They said they shouldn't have to configure anything", "They couldn't find the credentials email", "They asked for help with configuration"], correctIndex: 1 },
    ],
  },

  // ─── 9. Plagiarized Design ─────────────────────────────────────
  {
    title: "Brand Identity Package — Plagiarized from Existing Brand",
    expectedRuling: "BuyerWins",
    difficulty: "standard",
    analysisPrompt: "Compare the delivered design with the existing brand evidence. Assess whether the seller's work is original or copied. Consider the implications for the buyer if they used plagiarized branding.",
    expectedKeyFacts: [
      "delivered logo is nearly identical to existing brand Nexora Tech",
      "color palette is the same hex values",
      "typography choices match the existing brand exactly",
      "buyer discovered the plagiarism via reverse image search",
      "seller claimed the design was original",
      "using plagiarized branding would expose buyer to trademark litigation",
      "contract requires original work",
    ],
    evidence: [
      {
        name: "Plagiarism_Comparison.pdf",
        type: "application/pdf",
        generator: () => generatePDF("Plagiarism Evidence — Design Comparison", [
          { heading: "DELIVERED DESIGN (by seller)", body: "Logo: Geometric 'N' shape with gradient blue-to-purple\nPrimary color: #4A90D9 (blue) to #8B5CF6 (purple)\nFont: Montserrat Bold for wordmark\nTagline placement: Below wordmark, Montserrat Light" },
          { heading: "EXISTING BRAND: Nexora Tech (est. 2024)", body: "Logo: Geometric 'N' shape with gradient blue-to-purple\nPrimary color: #4A90D9 (blue) to #8B5CF6 (purple)\nFont: Montserrat Bold for wordmark\nTagline placement: Below wordmark, Montserrat Light\n\nSource: nexoratech.com — publicly visible since March 2024\nTrademark filing: USPTO Serial No. 98-123456" },
          { heading: "REVERSE IMAGE SEARCH", body: "Google Reverse Image Search on the delivered logo returned:\n1. nexoratech.com — exact match\n2. Behance portfolio post by NexoraTech designer (2024)\n3. Dribbble shot of original concept (2024)\n\nAll predate the seller's delivery by nearly 2 years." },
        ]),
      },
      {
        name: "Contract_Originality_Clause.pdf",
        type: "application/pdf",
        generator: () => generatePDF("Brand Identity Contract — Relevant Sections", [
          { heading: "ORIGINALITY REQUIREMENT", body: "Section 4.1: All design work must be original and created specifically for this project. Seller warrants that no part of the deliverables infringes on any third-party intellectual property rights.\n\nSection 4.2: Seller shall not use templates, stock designs, or existing brand assets from other companies. All elements must be designed from scratch.\n\nSection 4.3: If any deliverable is found to be non-original, buyer is entitled to a full refund and seller assumes all liability for any resulting legal claims." },
          { heading: "PAYMENT", body: "2,500 LOB for complete brand identity package" },
        ]),
      },
      {
        name: "Seller_Response_Chat.svg",
        type: "image/svg+xml",
        generator: () => generateChatSVG("LOBSTR Chat — Job #9310", [
          { from: "Buyer", text: "I ran a reverse image search on the logo you delivered. It's an EXACT copy of Nexora Tech's branding. Same colors, same font, same layout.", time: "Feb 16" },
          { from: "Seller", text: "That's just a coincidence. Geometric designs are common. I designed it from scratch.", time: "Feb 16" },
          { from: "Buyer", text: "Same hex codes (#4A90D9 to #8B5CF6), same Montserrat Bold font, same gradient angle. This isn't a coincidence.", time: "Feb 16" },
          { from: "Seller", text: "I used similar inspiration but it's different enough.", time: "Feb 17" },
          { from: "Buyer", text: "Nexora Tech has a USPTO trademark. If I used this branding I'd be liable for infringement. Filing a dispute.", time: "Feb 17" },
        ]),
      },
    ],
    mcQuestions: [
      { question: "What evidence suggests the design was plagiarized?", options: ["The buyer didn't like the colors", "Reverse image search returned exact matches from an existing brand", "The seller used a popular design template", "The fonts were different from what was requested"], correctIndex: 1 },
      { question: "When was the original brand (Nexora Tech) established?", options: ["2026", "2025", "2024", "2023"], correctIndex: 2 },
      { question: "What does the contract say about originality?", options: ["Originality is preferred but not required", "All work must be original, no third-party IP infringement", "Templates are acceptable with attribution", "The contract doesn't address originality"], correctIndex: 1 },
      { question: "What risk would the buyer face by using the delivered design?", options: ["No risk — similar designs are common", "Minor risk of a cease-and-desist letter", "Trademark infringement litigation from the existing brand", "Only a risk if the buyer operates in the same industry"], correctIndex: 2 },
      { question: "How did the seller respond to the plagiarism accusation?", options: ["Admitted to copying and offered a redesign", "First called it a coincidence, then said it was 'similar inspiration'", "Provided proof of independent creation", "Immediately offered a full refund"], correctIndex: 1 },
    ],
  },

  // ─── 10. Late Delivery Within Contract Terms ───────────────────
  {
    title: "Translation Project — Delivered Late but Within Grace Period",
    expectedRuling: "SellerWins",
    difficulty: "standard",
    analysisPrompt: "Review the contract's delivery terms carefully, including any grace period or extension clauses. Compare the actual delivery date against the contractual deadlines including any allowed extensions.",
    expectedKeyFacts: [
      "contract has 7-day grace period after initial deadline",
      "initial deadline was February 10",
      "seller delivered February 15 within grace period",
      "grace period extends deadline to February 17",
      "buyer claims seller missed deadline without reading grace clause",
      "quality of translation meets specifications",
      "seller communicated the delay on February 9",
    ],
    evidence: [
      {
        name: "Translation_Contract.pdf",
        type: "application/pdf",
        generator: () => generatePDF("Translation Services Agreement", [
          { heading: "PROJECT", body: "Technical manual translation from English to Japanese\n50 pages, ~25,000 words\nSpecialized medical device terminology required" },
          { heading: "TIMELINE", body: "Target delivery date: February 10, 2026\n\nGrace Period: Seller has a 7-calendar-day grace period after the target date for complex translations exceeding 20,000 words. During the grace period, no penalty applies and delivery is considered on-time.\n\nHard deadline: February 17, 2026 (target + 7 days)" },
          { heading: "QUALITY STANDARDS", body: "Translation must be reviewed by a native Japanese speaker\nMedical terminology must follow JIS T 0601 standards\nFormatting must match the original document layout" },
          { heading: "PAYMENT", body: "1,200 LOB tokens" },
        ]),
      },
      {
        name: "Delivery_Timeline.csv",
        type: "text/csv",
        generator: () => generateCSV(
          ["Date", "Event", "Notes"],
          [
            ["2026-01-20", "Contract signed", "Target deadline: Feb 10, Hard deadline: Feb 17"],
            ["2026-02-09", "Seller notifies delay", "Seller: Medical terminology review taking longer than expected. Will deliver by Feb 15."],
            ["2026-02-10", "Target deadline passes", "No delivery — but within 7-day grace period"],
            ["2026-02-13", "Buyer files dispute", "Buyer claims missed deadline"],
            ["2026-02-15", "Seller delivers translation", "Within grace period (hard deadline Feb 17)"],
            ["2026-02-15", "Quality check", "Translation verified by native speaker, meets JIS standards"],
          ]
        ),
      },
      {
        name: "Communication_Log.svg",
        type: "image/svg+xml",
        generator: () => generateChatSVG("LOBSTR Chat — Job #4455", [
          { from: "Seller", text: "Hi, the medical terminology section is taking more time than expected — needs careful cross-referencing with JIS standards. I'll deliver by Feb 15 (within the 7-day grace period in our contract).", time: "Feb 9" },
          { from: "Buyer", text: "The deadline is Feb 10. I need it on time.", time: "Feb 9" },
          { from: "Seller", text: "The contract includes a 7-day grace period for complex translations over 20K words. Our project qualifies. Feb 15 is still within terms.", time: "Feb 9" },
          { from: "Buyer", text: "I don't care about grace periods. I'm filing a dispute on Feb 10 if it's not delivered.", time: "Feb 10" },
          { from: "Seller", text: "Translation is done. Uploaded to the platform. Quality reviewed by a native Japanese medical translator.", time: "Feb 15" },
        ]),
      },
    ],
    mcQuestions: [
      { question: "What was the contract's target delivery date?", options: ["February 7", "February 10", "February 15", "February 17"], correctIndex: 1 },
      { question: "What is the contract's grace period for complex translations?", options: ["No grace period exists", "3 days", "7 days", "14 days"], correctIndex: 2 },
      { question: "When did the seller actually deliver?", options: ["February 10", "February 13", "February 15", "February 18"], correctIndex: 2 },
      { question: "Did the seller communicate about the delay?", options: ["No communication at all", "Yes, notified the buyer the day before the target deadline", "Only after the buyer complained", "Sent daily updates throughout"], correctIndex: 1 },
      { question: "Was the delivery within the contractual grace period?", options: ["No, it exceeded the grace period", "Yes, February 15 is before the hard deadline of February 17", "The contract doesn't have a grace period", "The grace period only applies to translations under 10K words"], correctIndex: 1 },
    ],
  },

  // ─── 11. Unauthorized Subcontracting ───────────────────────────
  {
    title: "Smart Contract Development — Outsourced Without Consent",
    expectedRuling: "BuyerWins",
    difficulty: "standard",
    analysisPrompt: "Review the contract's subcontracting clause and the evidence that work was outsourced. Consider the security implications of unauthorized third-party access to the buyer's project.",
    expectedKeyFacts: [
      "contract explicitly prohibits subcontracting without written consent",
      "git commit history shows 3 different authors",
      "commit emails belong to a Fiverr freelancer account",
      "seller was hired specifically for their security expertise",
      "unknown third party had access to buyer's codebase",
      "code quality issues suggest less experienced developer",
      "seller did not disclose subcontracting",
    ],
    evidence: [
      {
        name: "Development_Contract.pdf",
        type: "application/pdf",
        generator: () => generatePDF("Smart Contract Development Agreement", [
          { heading: "CONFIDENTIALITY & SUBCONTRACTING", body: "Section 7.1: Seller shall NOT subcontract, delegate, or outsource any portion of the work to third parties without prior written consent from the Buyer.\n\nSection 7.2: Buyer selected Seller specifically based on Seller's demonstrated expertise in Solidity security and DeFi protocol design. The personal performance of Seller is a material term of this agreement.\n\nSection 7.3: Unauthorized subcontracting constitutes a material breach and entitles Buyer to a full refund regardless of work completion status." },
          { heading: "PROJECT", body: "Develop a DeFi staking protocol with:\n- Staking/unstaking with time-lock\n- Reward distribution mechanism\n- Governance voting integration\n\nPayment: 5,000 LOB tokens" },
        ]),
      },
      {
        name: "Git_Commit_History.csv",
        type: "text/csv",
        generator: () => generateCSV(
          ["Commit Hash", "Author", "Email", "Date", "Message"],
          [
            ["a1b2c3d", "Marcus Chen", "marcus@securecodedev.com", "2026-02-01", "Initial project setup"],
            ["e4f5g6h", "Marcus Chen", "marcus@securecodedev.com", "2026-02-03", "Add staking contract skeleton"],
            ["i7j8k9l", "dev_freelancer_92", "devfl92@gmail.com", "2026-02-05", "implement staking logic"],
            ["m0n1o2p", "dev_freelancer_92", "devfl92@gmail.com", "2026-02-06", "add reward distribution"],
            ["q3r4s5t", "fiverr_coder_pro", "fiverrpro@outlook.com", "2026-02-07", "governance voting module"],
            ["u6v7w8x", "fiverr_coder_pro", "fiverrpro@outlook.com", "2026-02-08", "fix compilation errors"],
            ["y9z0a1b", "Marcus Chen", "marcus@securecodedev.com", "2026-02-10", "Final cleanup and delivery"],
          ]
        ),
      },
      {
        name: "Discovery_Chat.svg",
        type: "image/svg+xml",
        generator: () => generateChatSVG("LOBSTR Chat — Job #2847", [
          { from: "Buyer", text: "Marcus, I looked at the git history. Who are 'dev_freelancer_92' and 'fiverr_coder_pro'? The contract says no subcontracting.", time: "Feb 11" },
          { from: "Seller", text: "Those are just my alternate accounts I use for different machines.", time: "Feb 11" },
          { from: "Buyer", text: "One is a Gmail address and the other is an Outlook address registered to different names. And the commit messages have completely different coding styles.", time: "Feb 11" },
          { from: "Seller", text: "OK I had some helpers do the non-critical parts. But I reviewed everything.", time: "Feb 12" },
          { from: "Buyer", text: "You outsourced a SECURITY-CRITICAL smart contract to unknown people without telling me. This is a material breach per Section 7.3.", time: "Feb 12" },
        ]),
      },
    ],
    mcQuestions: [
      { question: "What does the contract say about subcontracting?", options: ["Subcontracting is allowed with notice", "It's prohibited without written consent, and violation is a material breach", "It's not mentioned in the contract", "Subcontracting is allowed for non-core tasks"], correctIndex: 1 },
      { question: "How many different authors appear in the git commit history?", options: ["1", "2", "3", "4"], correctIndex: 2 },
      { question: "How did the seller initially explain the multiple authors?", options: ["Admitted to subcontracting immediately", "Claimed they were alternate accounts on different machines", "Said they were open-source contributors", "Blamed a git merge error"], correctIndex: 1 },
      { question: "Why is unauthorized subcontracting particularly concerning for this project?", options: ["It's a UI project with no security implications", "Unknown third parties had access to a security-critical smart contract codebase", "The subcontractors charged more than the seller", "The timeline was extended due to coordination overhead"], correctIndex: 1 },
      { question: "What does Section 7.3 of the contract state?", options: ["Subcontracting incurs a 50% penalty", "The buyer must approve subcontractors within 48 hours", "Unauthorized subcontracting entitles the buyer to a full refund", "Subcontracting is allowed for up to 20% of the work"], correctIndex: 2 },
    ],
  },

  // ─── 12. Payment Records Show Correct Amount ───────────────────
  {
    title: "Consulting Engagement — Buyer Claims Overcharge (Records Disagree)",
    expectedRuling: "SellerWins",
    difficulty: "standard",
    analysisPrompt: "Examine the payment records, hourly logs, and contract rate. Calculate whether the total billed amount matches the contracted rate times the hours worked. Determine if the buyer's overcharge claim has merit.",
    expectedKeyFacts: [
      "contract rate is 50 LOB per hour",
      "seller logged 20 hours of work",
      "total billed is 1000 LOB which matches 20 hours at 50 LOB/hr",
      "buyer claims they were charged 1500 LOB but escrow shows 1000",
      "time logs are detailed with task descriptions",
      "buyer approved weekly time reports",
      "escrow transaction confirms 1000 LOB deposit",
    ],
    evidence: [
      {
        name: "Consulting_Contract.pdf",
        type: "application/pdf",
        generator: () => generatePDF("Consulting Services Agreement", [
          { heading: "TERMS", body: "Consultant: TechAdvisory Group (Seller)\nClient: FutureStack Labs (Buyer)\n\nRate: 50 LOB tokens per hour\nEstimated hours: 15-25 hours\nBilling: Weekly time reports, client approval required\nEscrow: Maximum of 1,250 LOB deposited (25 hours × 50 LOB)\nActual billing based on approved hours worked" },
          { heading: "TIME TRACKING", body: "Consultant will submit detailed weekly time reports showing:\n- Date\n- Hours worked (minimum 30-minute increments)\n- Task description\n\nClient must approve or dispute each weekly report within 48 hours. Failure to dispute = automatic approval." },
        ]),
      },
      {
        name: "Time_Log_Approved.csv",
        type: "text/csv",
        generator: () => generateCSV(
          ["Date", "Hours", "Task", "Status"],
          [
            ["2026-02-01", "3.0", "System architecture review and documentation", "Approved (Feb 3)"],
            ["2026-02-02", "2.5", "Database schema design consultation", "Approved (Feb 3)"],
            ["2026-02-04", "4.0", "API design workshop with engineering team", "Approved (Feb 6)"],
            ["2026-02-05", "2.0", "Security audit recommendations", "Approved (Feb 6)"],
            ["2026-02-07", "3.5", "Performance optimization review", "Approved (Feb 9)"],
            ["2026-02-08", "2.0", "CI/CD pipeline recommendations", "Approved (Feb 9)"],
            ["2026-02-10", "3.0", "Final report and presentation preparation", "Approved (Feb 12)"],
            ["TOTAL", "20.0", "", "All weeks approved by client"],
          ]
        ),
      },
      {
        name: "Payment_Dispute_Chat.svg",
        type: "image/svg+xml",
        generator: () => generateChatSVG("LOBSTR Chat — Job #6677", [
          { from: "Seller", text: "Final invoice: 20 hours × 50 LOB = 1,000 LOB. All time reports were approved by your team.", time: "Feb 12" },
          { from: "Buyer", text: "I'm seeing a charge for 1,500 LOB on my end. You overcharged us.", time: "Feb 13" },
          { from: "Seller", text: "The escrow was set at 1,250 LOB (max 25 hours). I only billed 1,000 LOB for 20 actual hours. The remaining 250 LOB should return to you.", time: "Feb 13" },
          { from: "Buyer", text: "I don't trust these numbers. I'm disputing the full amount.", time: "Feb 13" },
          { from: "Seller", text: "You can check the LOBSTR escrow transaction — it shows 1,000 LOB billed. Your team approved every weekly time report.", time: "Feb 14" },
        ]),
      },
    ],
    mcQuestions: [
      { question: "What is the contracted hourly rate?", options: ["25 LOB", "50 LOB", "75 LOB", "100 LOB"], correctIndex: 1 },
      { question: "How many hours did the seller work?", options: ["15", "20", "25", "30"], correctIndex: 1 },
      { question: "What is the correct total for 20 hours at 50 LOB/hour?", options: ["750 LOB", "1,000 LOB", "1,250 LOB", "1,500 LOB"], correctIndex: 1 },
      { question: "Did the buyer approve the weekly time reports?", options: ["No, they were never submitted", "The buyer rejected half the hours", "Yes, all weekly reports were approved within 48 hours", "The buyer didn't respond (automatic approval)"], correctIndex: 2 },
      { question: "What amount was actually escrowed?", options: ["1,000 LOB", "1,250 LOB", "1,500 LOB", "2,000 LOB"], correctIndex: 1 },
    ],
  },

  // ─── 13. Wrong Language Translation ────────────────────────────
  {
    title: "Document Translation — Delivered in Wrong Language",
    expectedRuling: "BuyerWins",
    difficulty: "standard",
    analysisPrompt: "Compare the contracted language pair with what was actually delivered. Assess whether this was a minor mistake or a fundamental failure to meet the core requirement of the contract.",
    expectedKeyFacts: [
      "contract specifies English to Spanish translation",
      "seller delivered English to Portuguese translation",
      "Portuguese and Spanish are different languages",
      "buyer needs Spanish for Latin American market",
      "Portuguese translation is useless for buyer's target market",
      "seller admits the mistake but won't redo for free",
      "this is not a dialect issue but a completely wrong language",
    ],
    evidence: [
      {
        name: "Translation_Order.pdf",
        type: "application/pdf",
        generator: () => generatePDF("Translation Order Confirmation", [
          { heading: "ORDER DETAILS", body: "Job #8834 on LOBSTR Platform\n\nDocument: Product user manual (45 pages)\nSource language: English\nTarget language: SPANISH (Latin American variant)\nBuyer: CargoLogix (serves Mexico, Colombia, Argentina)\nSeller: GlobalLingua Translations" },
          { heading: "REQUIREMENTS", body: "- Latin American Spanish (not Castilian/Spain Spanish)\n- Technical terminology for logistics software\n- Maintain original formatting and layout\n- Proofread by native Spanish speaker" },
          { heading: "PAYMENT", body: "900 LOB tokens" },
        ]),
      },
      {
        name: "Language_Comparison.pdf",
        type: "application/pdf",
        generator: () => generatePDF("Language Verification — Sample Text Comparison", [
          { heading: "ORIGINAL ENGLISH", body: "Chapter 1: Getting Started\nWelcome to CargoLogix. This manual will guide you through the setup process for our logistics tracking platform." },
          { heading: "EXPECTED (SPANISH)", body: "Capitulo 1: Primeros Pasos\nBienvenido a CargoLogix. Este manual le guiara a traves del proceso de configuracion de nuestra plataforma de seguimiento logistico." },
          { heading: "DELIVERED (PORTUGUESE)", body: "Capitulo 1: Primeiros Passos\nBem-vindo ao CargoLogix. Este manual ira guia-lo atraves do processo de configuracao da nossa plataforma de rastreamento logistico." },
          { heading: "VERIFICATION", body: "Language detection tool (Google Translate, DeepL): Delivered document is PORTUGUESE (Brazilian variant), not Spanish.\n\nKey differences visible in sample:\n- 'Bienvenido' (Spanish) vs 'Bem-vindo' (Portuguese)\n- 'le guiara' (Spanish) vs 'ira guia-lo' (Portuguese)\n- 'seguimiento' (Spanish) vs 'rastreamento' (Portuguese)\n\nThese are entirely different languages, not regional dialects." },
        ]),
      },
      {
        name: "Seller_Response.svg",
        type: "image/svg+xml",
        generator: () => generateChatSVG("LOBSTR Chat — Job #8834", [
          { from: "Buyer", text: "This is in Portuguese, not Spanish. The contract clearly says Spanish. Our customers are in Mexico and Colombia.", time: "Feb 14" },
          { from: "Seller", text: "Oh, I see the issue. My translator mixed up the target language. Honest mistake.", time: "Feb 14" },
          { from: "Buyer", text: "Can you redo it in Spanish?", time: "Feb 14" },
          { from: "Seller", text: "I'd need another 500 LOB to redo the translation. My translator already completed the Portuguese version.", time: "Feb 15" },
          { from: "Buyer", text: "You delivered the wrong language. I'm not paying extra for you to do what the contract originally required. Filing a dispute.", time: "Feb 15" },
        ]),
      },
    ],
    mcQuestions: [
      { question: "What language was the translation supposed to be in?", options: ["Portuguese", "French", "Spanish (Latin American)", "Italian"], correctIndex: 2 },
      { question: "What language was actually delivered?", options: ["Spanish (Castilian)", "Portuguese", "Italian", "French"], correctIndex: 1 },
      { question: "Are Portuguese and Spanish the same language?", options: ["Yes, they are regional dialects of the same language", "No, they are entirely different languages", "They are mutually intelligible and interchangeable", "Portuguese is a subset of Spanish"], correctIndex: 1 },
      { question: "How did the seller respond to the error?", options: ["Offered to redo it for free", "Admitted the mistake but wanted 500 more LOB to redo it", "Denied any error was made", "Offered a 50% discount on a redo"], correctIndex: 1 },
      { question: "Why is the wrong language particularly problematic for the buyer?", options: ["It's a minor inconvenience", "The buyer's customers are in Spanish-speaking countries, making Portuguese useless", "Portuguese is harder to read", "The formatting was wrong"], correctIndex: 1 },
    ],
  },

  // ─── 14. Seller Delivered Extra Work ───────────────────────────
  {
    title: "Data Analysis — Seller Exceeded Scope (Buyer Refuses to Pay)",
    expectedRuling: "SellerWins",
    difficulty: "standard",
    analysisPrompt: "Evaluate whether the seller delivered the contracted work. Determine if the buyer's complaint is about the quality of contracted deliverables or about being charged for the contracted amount despite receiving extra value.",
    expectedKeyFacts: [
      "seller delivered all 4 contracted reports",
      "seller also delivered 2 bonus reports at no extra charge",
      "buyer claims they only wanted the bonus reports and not the original 4",
      "contract clearly specifies the 4 reports by name",
      "buyer never amended the contract",
      "all 4 contracted reports meet quality specifications",
      "buyer wants refund because they changed their mind about what they need",
    ],
    evidence: [
      {
        name: "Analysis_Contract.pdf",
        type: "application/pdf",
        generator: () => generatePDF("Data Analysis Services Contract", [
          { heading: "DELIVERABLES", body: "Seller will produce the following 4 reports:\n\n1. Customer Acquisition Cost (CAC) Analysis — Q4 2025\n2. Monthly Recurring Revenue (MRR) Trend Report — 2025\n3. Churn Rate Analysis with Cohort Breakdown\n4. Lifetime Value (LTV) Segmentation Report\n\nAll reports in PDF format with supporting data in Excel." },
          { heading: "PAYMENT", body: "1,600 LOB tokens for all 4 reports" },
          { heading: "ACCEPTANCE", body: "Buyer will review reports within 5 business days. Reports meeting the specifications above are considered accepted." },
        ]),
      },
      {
        name: "Delivery_Manifest.csv",
        type: "text/csv",
        generator: () => generateCSV(
          ["Report", "Contracted", "Delivered", "Pages", "Quality Check"],
          [
            ["CAC Analysis Q4 2025", "Yes", "Yes", "12", "Meets spec"],
            ["MRR Trend Report 2025", "Yes", "Yes", "18", "Meets spec"],
            ["Churn Rate Cohort Analysis", "Yes", "Yes", "15", "Meets spec"],
            ["LTV Segmentation Report", "Yes", "Yes", "14", "Meets spec"],
            ["BONUS: Revenue Forecast 2026", "No (free extra)", "Yes", "8", "Bonus"],
            ["BONUS: Competitive Benchmark", "No (free extra)", "Yes", "10", "Bonus"],
          ]
        ),
      },
      {
        name: "Dispute_Chat.svg",
        type: "image/svg+xml",
        generator: () => generateChatSVG("LOBSTR Chat — Job #5590", [
          { from: "Seller", text: "All 4 contracted reports are done! I also threw in a Revenue Forecast and Competitive Benchmark as bonus deliverables at no extra charge.", time: "Feb 16" },
          { from: "Buyer", text: "Actually, I realized I really only need the Revenue Forecast and Competitive Benchmark. The original 4 reports aren't that useful to me anymore.", time: "Feb 17" },
          { from: "Seller", text: "The contract is for the 4 specific reports, which I delivered in full. The bonus reports were extra value.", time: "Feb 17" },
          { from: "Buyer", text: "I'm not paying 1,600 LOB for reports I don't need. I want a refund.", time: "Feb 18" },
          { from: "Seller", text: "You contracted 4 reports, I delivered all 4 plus 2 extras. That's 6 reports for the price of 4.", time: "Feb 18" },
        ]),
      },
    ],
    mcQuestions: [
      { question: "How many reports were specified in the contract?", options: ["2", "4", "6", "8"], correctIndex: 1 },
      { question: "How many reports did the seller deliver?", options: ["2", "4", "6", "8"], correctIndex: 2 },
      { question: "Did the seller deliver all contracted reports?", options: ["No, 2 were missing", "Only the bonus reports were delivered", "Yes, all 4 contracted reports plus 2 bonus", "Only 3 of 4 were delivered"], correctIndex: 2 },
      { question: "What is the buyer's reason for requesting a refund?", options: ["Reports were poor quality", "Reports were delivered late", "Buyer changed their mind about which reports they want", "Reports contained inaccurate data"], correctIndex: 2 },
      { question: "Were the bonus reports charged to the buyer?", options: ["Yes, at 400 LOB each", "Yes, the total was increased to 2,400 LOB", "No, they were delivered at no extra charge", "The buyer was charged a 50% premium"], correctIndex: 2 },
    ],
  },

  // ─── 15. Smart Contract Audit Negligence ───────────────────────
  {
    title: "Smart Contract Security Audit — Missed Critical Vulnerability",
    expectedRuling: "BuyerWins",
    difficulty: "standard",
    analysisPrompt: "Evaluate the audit scope, the auditor's report, and the exploit that occurred. Determine if the missed vulnerability fell within the contracted audit scope and whether the auditor exercised reasonable professional diligence.",
    expectedKeyFacts: [
      "audit scope explicitly includes reentrancy vulnerabilities",
      "audit report says no reentrancy issues found",
      "contract was exploited via reentrancy 2 weeks after audit",
      "the reentrancy vulnerability was in a function that was in audit scope",
      "standard audit tools like Slither would have caught it",
      "auditor spent only 3 days on a project scoped for 10 days",
      "auditor's report lacks evidence of thorough testing",
      "buyer lost funds due to the exploit",
    ],
    evidence: [
      {
        name: "Audit_Contract.pdf",
        type: "application/pdf",
        generator: () => generatePDF("Smart Contract Security Audit Agreement", [
          { heading: "SCOPE", body: "Full security audit of the FluxVault DeFi protocol:\n- vault.sol (deposit/withdraw logic)\n- rewards.sol (reward distribution)\n- governance.sol (voting mechanism)\n\nAudit must cover:\n1. Reentrancy vulnerabilities\n2. Integer overflow/underflow\n3. Access control issues\n4. Flash loan attack vectors\n5. Oracle manipulation risks\n\nEstimated effort: 10 business days" },
          { heading: "AUDITOR OBLIGATIONS", body: "Auditor shall:\n- Use industry-standard tools (Slither, Mythril, manual review)\n- Test all public and external functions\n- Provide severity ratings (Critical, High, Medium, Low, Info)\n- Deliver a comprehensive report with findings and remediation steps\n\nAuditor warrants professional-grade diligence appropriate for DeFi security audits." },
          { heading: "PAYMENT", body: "8,000 LOB tokens" },
        ]),
      },
      {
        name: "Audit_Report_Summary.pdf",
        type: "application/pdf",
        generator: () => generatePDF("FluxVault Security Audit Report — SUMMARY", [
          { heading: "AUDIT METADATA", body: "Auditor: ChainShield Security (Seller)\nDuration: 3 days (February 5-7, 2026)\nTools used: 'Manual review'\nLines of code reviewed: 1,847" },
          { heading: "FINDINGS SUMMARY", body: "Critical: 0\nHigh: 0\nMedium: 1 (unused return value in rewards.sol)\nLow: 2 (missing events, gas optimization)\nInformational: 3\n\nOVERALL ASSESSMENT: The FluxVault protocol is well-designed and secure. No significant vulnerabilities were found." },
          { heading: "REENTRANCY ANALYSIS", body: "Section 4.1: Reentrancy Review\nAll external calls in vault.sol follow the checks-effects-interactions pattern.\n\nResult: NO REENTRANCY ISSUES FOUND" },
          { heading: "POST-AUDIT EXPLOIT (February 20, 2026)", body: "The vault.sol withdraw() function was exploited via a classic reentrancy attack.\n\nThe function updates state AFTER the external call (violating checks-effects-interactions).\nThis is a textbook reentrancy pattern that Slither detects automatically.\n\nLoss: 50,000 USDC drained from the vault.\n\nThe auditor's report explicitly stated no reentrancy issues exist in vault.sol. This is a critical miss within the contracted audit scope." },
        ]),
      },
      {
        name: "Exploit_Timeline.csv",
        type: "text/csv",
        generator: () => generateCSV(
          ["Date", "Event", "Details"],
          [
            ["2026-02-05", "Audit begins", "ChainShield starts review"],
            ["2026-02-07", "Audit report delivered", "3 days instead of contracted 10 days"],
            ["2026-02-08", "Buyer deploys contracts", "Based on clean audit report"],
            ["2026-02-20", "Reentrancy exploit", "50,000 USDC drained via withdraw() reentrancy"],
            ["2026-02-20", "Post-mortem analysis", "Slither identifies the vuln in 2 seconds flat"],
            ["2026-02-21", "Buyer files dispute", "Auditor missed a critical in-scope vulnerability"],
          ]
        ),
      },
    ],
    mcQuestions: [
      { question: "Was reentrancy analysis part of the contracted audit scope?", options: ["No, it was excluded", "It was optional", "Yes, it was explicitly listed as item #1", "The scope didn't specify vulnerability types"], correctIndex: 2 },
      { question: "What did the audit report say about reentrancy?", options: ["Found 1 critical reentrancy bug", "Found reentrancy risk but rated it Low", "Stated no reentrancy issues were found", "Did not analyze reentrancy at all"], correctIndex: 2 },
      { question: "How long did the auditor spend on the audit?", options: ["10 days as contracted", "7 days", "3 days", "1 day"], correctIndex: 2 },
      { question: "What tools did the auditor claim to use?", options: ["Slither, Mythril, and manual review", "Only manual review", "Slither only", "No tools mentioned"], correctIndex: 1 },
      { question: "Would standard automated tools have caught the vulnerability?", options: ["No, it required manual analysis", "Only proprietary tools could find it", "Yes, Slither detects it automatically", "The vulnerability type is unknown to automated tools"], correctIndex: 2 },
    ],
  },
];

// ── Main Seed Function ───────────────────────────────────────────────────────

async function seed() {
  console.log(`\nSeeding ${SCENARIOS.length} arbitrator test scenarios...\n`);

  for (let i = 0; i < SCENARIOS.length; i++) {
    const s = SCENARIOS[i];
    const scenarioId = `scenario_${String(i + 1).padStart(2, "0")}`;
    console.log(`  [${i + 1}/${SCENARIOS.length}] ${s.title}`);

    // Generate and upload evidence files
    const evidenceUrls = [];
    for (const ev of s.evidence) {
      const buffer = await ev.generator();
      const storagePath = `test_scenarios/${scenarioId}/${ev.name}`;
      const url = await uploadFile(storagePath, buffer, ev.type);
      evidenceUrls.push(url);
      console.log(`    ✓ Uploaded ${ev.name}`);
    }

    // Write scenario doc to Firestore
    await db.collection("test_scenarios").doc(scenarioId).set({
      title: s.title,
      expectedRuling: s.expectedRuling,
      difficulty: s.difficulty,
      analysisPrompt: s.analysisPrompt,
      expectedKeyFacts: s.expectedKeyFacts,
      evidenceFiles: evidenceUrls,
      mcQuestions: s.mcQuestions,
      createdAt: Date.now(),
    });

    console.log(`    ✓ Firestore doc created: test_scenarios/${scenarioId}`);
  }

  console.log(`\n✅ Done! ${SCENARIOS.length} scenarios seeded with ${SCENARIOS.reduce((n, s) => n + s.evidence.length, 0)} evidence files.\n`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
