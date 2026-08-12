import fs from "node:fs/promises";
import path from "node:path";

import {
  PDFDocument,
  StandardFonts,
  cmyk,
  degrees,
  rgb,
} from "pdf-lib";
import sharp from "sharp";

const root = process.cwd();
const sourceDir = path.join(root, "assets", "source");
const samplesDir = path.join(root, "public", "samples");

const colors = {
  navy: "#142b4a",
  gold: "#a67c2e",
  ivory: "#f6ecd5",
};

const warningBody =
  "(1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

function frontOverlay({ alcoholByVolume = 45, proof = 90 } = {}) {
  return Buffer.from(`
    <svg width="1200" height="1800" viewBox="0 0 1200 1800" xmlns="http://www.w3.org/2000/svg">
      <rect x="120" y="680" width="960" height="650" rx="18" fill="#f8efdccc" stroke="${colors.gold}" stroke-width="3"/>
      <text x="600" y="790" text-anchor="middle" fill="${colors.navy}" font-family="Georgia, serif" font-size="98" font-weight="700" letter-spacing="8">CIVIC OAK</text>
      <text x="600" y="865" text-anchor="middle" fill="${colors.gold}" font-family="Arial, sans-serif" font-size="31" font-weight="700" letter-spacing="10">FOUNDERS RESERVE</text>
      <line x1="320" x2="880" y1="914" y2="914" stroke="${colors.gold}" stroke-width="3"/>
      <text x="600" y="985" text-anchor="middle" fill="${colors.navy}" font-family="Georgia, serif" font-size="42" font-style="italic">Kentucky Straight</text>
      <text x="600" y="1045" text-anchor="middle" fill="${colors.navy}" font-family="Georgia, serif" font-size="52" font-weight="700">BOURBON WHISKEY</text>
      <text x="600" y="1115" text-anchor="middle" fill="${colors.navy}" font-family="Arial, sans-serif" font-size="26" letter-spacing="4">DISTILLED AND BOTTLED IN KENTUCKY</text>
      <line x1="320" x2="880" y1="1160" y2="1160" stroke="${colors.gold}" stroke-width="2"/>
      <text x="245" y="1245" text-anchor="start" fill="${colors.navy}" font-family="Arial, sans-serif" font-size="28" font-weight="700">${alcoholByVolume}% ALC./VOL.</text>
      <text x="600" y="1245" text-anchor="middle" fill="${colors.navy}" font-family="Arial, sans-serif" font-size="26">(${proof} PROOF)</text>
      <text x="955" y="1245" text-anchor="end" fill="${colors.navy}" font-family="Arial, sans-serif" font-size="28" font-weight="700">750 mL</text>
      <text x="600" y="1300" text-anchor="middle" fill="${colors.navy}" font-family="Arial, sans-serif" font-size="20" letter-spacing="3">SYNTHETIC DEMONSTRATION LABEL</text>
    </svg>
  `);
}

function backOverlay({ warning = warningBody } = {}) {
  const warningLines = warning.match(/.{1,64}(?:\s|$)/g) ?? [warning];
  return Buffer.from(`
    <svg width="1200" height="1800" viewBox="0 0 1200 1800" xmlns="http://www.w3.org/2000/svg">
      <text x="600" y="470" text-anchor="middle" fill="${colors.navy}" font-family="Georgia, serif" font-size="54" font-weight="700" letter-spacing="4">CIVIC OAK</text>
      <text x="600" y="520" text-anchor="middle" fill="${colors.gold}" font-family="Arial, sans-serif" font-size="23" font-weight="700" letter-spacing="6">FOUNDERS RESERVE</text>
      <text x="600" y="600" text-anchor="middle" fill="${colors.navy}" font-family="Georgia, serif" font-size="28" font-style="italic">A patient Kentucky bourbon shaped by oak, time, and craft.</text>
      <text x="600" y="665" text-anchor="middle" fill="${colors.navy}" font-family="Arial, sans-serif" font-size="24">Distilled and bottled by Civic Oak Distilling Co.</text>
      <text x="600" y="700" text-anchor="middle" fill="${colors.navy}" font-family="Arial, sans-serif" font-size="24">Frankfort, Kentucky 40601</text>
      <line x1="165" x2="1035" y1="755" y2="755" stroke="${colors.gold}" stroke-width="3"/>

      <rect x="145" y="805" width="910" height="505" rx="12" fill="#fffaf0dd" stroke="${colors.navy}" stroke-width="3"/>
      <text x="190" y="875" fill="${colors.navy}" font-family="Arial, sans-serif" font-size="30" font-weight="700">GOVERNMENT WARNING:</text>
      <text x="190" y="930" fill="${colors.navy}" font-family="Arial, sans-serif" font-size="27">${warningLines
        .map((line, index) => `<tspan x="190" dy="${index === 0 ? 0 : 40}">${line.trim()}</tspan>`)
        .join("")}</text>

      <line x1="165" x2="1035" y1="1370" y2="1370" stroke="${colors.gold}" stroke-width="2"/>
      <text x="600" y="1435" text-anchor="middle" fill="${colors.navy}" font-family="Arial, sans-serif" font-size="25" font-weight="700">45% ALC./VOL. (90 PROOF) · 750 mL</text>
      <text x="600" y="1490" text-anchor="middle" fill="${colors.navy}" font-family="Arial, sans-serif" font-size="20" letter-spacing="3">SYNTHETIC DEMONSTRATION LABEL</text>
    </svg>
  `);
}

async function createLabel(outputDir, backgroundName, outputName, overlay) {
  await sharp(path.join(sourceDir, backgroundName))
    .resize(1200, 1800, { fit: "fill" })
    .composite([{ input: overlay }])
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(path.join(outputDir, outputName));
}

function drawField(page, font, bold, label, value, x, y, width) {
  page.drawText(label.toUpperCase(), {
    x,
    y,
    size: 8,
    font: bold,
    color: rgb(0.16, 0.25, 0.37),
  });
  page.drawText(value, {
    x,
    y: y - 18,
    size: 11,
    font,
    color: rgb(0.05, 0.08, 0.12),
    maxWidth: width,
  });
  page.drawLine({
    start: { x, y: y - 25 },
    end: { x: x + width, y: y - 25 },
    thickness: 0.6,
    color: rgb(0.75, 0.76, 0.75),
  });
}

async function createApplicationPdf(outputDir) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const serif = await pdf.embedFont(StandardFonts.TimesRomanBold);

  pdf.setTitle("LabelProof Synthetic COLA Application Summary");
  pdf.setSubject("Synthetic test fixture modeled on TTB F 5100.31 fields");
  pdf.setAuthor("LabelProof");

  page.drawRectangle({
    x: 0,
    y: 0,
    width: 612,
    height: 792,
    color: rgb(0.98, 0.97, 0.93),
  });
  page.drawRectangle({
    x: 0,
    y: 705,
    width: 612,
    height: 87,
    color: rgb(0.08, 0.17, 0.29),
  });
  page.drawText("LABELPROOF", {
    x: 42,
    y: 753,
    size: 11,
    font: bold,
    color: cmyk(0, 0.17, 0.67, 0.35),
  });
  page.drawText("Synthetic COLA Application Summary", {
    x: 42,
    y: 724,
    size: 22,
    font: serif,
    color: rgb(1, 1, 1),
  });
  page.drawText("MODELED ON TTB F 5100.31 · NOT FOR SUBMISSION", {
    x: 42,
    y: 689,
    size: 9,
    font: bold,
    color: rgb(0.52, 0.38, 0.12),
  });

  page.drawText("SYNTHETIC SAMPLE", {
    x: 95,
    y: 350,
    size: 52,
    font: bold,
    rotate: degrees(35),
    color: rgb(0.72, 0.73, 0.72),
    opacity: 0.16,
  });

  page.drawText("Application", {
    x: 42,
    y: 650,
    size: 14,
    font: bold,
    color: rgb(0.08, 0.17, 0.29),
  });

  drawField(page, font, bold, "Serial number", "26-001", 42, 622, 160);
  drawField(page, font, bold, "Product source", "Domestic", 222, 622, 160);
  drawField(page, font, bold, "Product type", "Distilled Spirits", 402, 622, 168);
  drawField(page, font, bold, "Plant registry / permit", "DSP-KY-99999 (fictional)", 42, 563, 250);
  drawField(page, font, bold, "Application type", "Certificate of Label Approval", 312, 563, 258);

  page.drawText("Product identity", {
    x: 42,
    y: 500,
    size: 14,
    font: bold,
    color: rgb(0.08, 0.17, 0.29),
  });
  drawField(page, font, bold, "Brand name", "CIVIC OAK", 42, 471, 250);
  drawField(page, font, bold, "Fanciful name", "FOUNDERS RESERVE", 312, 471, 258);
  drawField(page, font, bold, "Class / type", "Kentucky Straight Bourbon Whiskey", 42, 412, 528);
  drawField(page, font, bold, "Alcohol content", "45% Alc./Vol. (90 Proof)", 42, 353, 250);
  drawField(page, font, bold, "Net contents", "750 mL", 312, 353, 258);

  page.drawText("Applicant", {
    x: 42,
    y: 290,
    size: 14,
    font: bold,
    color: rgb(0.08, 0.17, 0.29),
  });
  drawField(page, font, bold, "Name", "Civic Oak Distilling Co. (fictional)", 42, 261, 528);
  drawField(page, font, bold, "Address", "100 Sample House Road, Frankfort, Kentucky 40601", 42, 202, 528);

  page.drawRectangle({
    x: 42,
    y: 70,
    width: 528,
    height: 74,
    borderWidth: 1,
    borderColor: rgb(0.65, 0.55, 0.32),
    color: rgb(1, 0.98, 0.91),
  });
  page.drawText("Prototype fixture", {
    x: 56,
    y: 119,
    size: 10,
    font: bold,
    color: rgb(0.36, 0.27, 0.09),
  });
  page.drawText("This document contains invented applicant and permit data. It is designed only", {
    x: 56,
    y: 99,
    size: 9,
    font,
    color: rgb(0.22, 0.20, 0.16),
  });
  page.drawText("to test application-to-label extraction and comparison in the LabelProof demo.", {
    x: 56,
    y: 84,
    size: 9,
    font,
    color: rgb(0.22, 0.20, 0.16),
  });

  const bytes = await pdf.save();
  await fs.writeFile(path.join(outputDir, "application.pdf"), bytes);
}

async function writeManifest(outputDir, { id, name, intendedOutcome, description }) {
  const manifest = {
    id,
    name,
    intendedOutcome,
    description,
    synthetic: true,
    application: "application.pdf",
    labels: ["front-label.jpg", "back-label.jpg"],
    expected: {
      beverageCategory: "distilled_spirits",
      brandName: "CIVIC OAK",
      fancifulName: "FOUNDERS RESERVE",
      classType: "Kentucky Straight Bourbon Whiskey",
      alcoholByVolume: 45,
      proof: 90,
      netContents: { value: 750, unit: "mL" },
      governmentWarningHeading: "GOVERNMENT WARNING:",
      governmentWarningBody: warningBody,
    },
  };

  await fs.writeFile(
    path.join(outputDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

async function createSample({
  id,
  name,
  intendedOutcome,
  description,
  alcoholByVolume = 45,
  proof = 90,
  warning = warningBody,
  blurBackLabel = false,
}) {
  const outputDir = path.join(samplesDir, id);
  await fs.mkdir(outputDir, { recursive: true });

  await Promise.all([
    createLabel(
      outputDir,
      "civic-oak-front-background.png",
      "front-label.jpg",
      frontOverlay({ alcoholByVolume, proof }),
    ),
    createLabel(
      outputDir,
      "civic-oak-back-background.png",
      "back-label.jpg",
      backOverlay({ warning }),
    ),
    createApplicationPdf(outputDir),
    writeManifest(outputDir, { id, name, intendedOutcome, description }),
  ]);

  if (blurBackLabel) {
    await sharp(path.join(outputDir, "back-label.jpg"))
      .blur(8)
      .jpeg({ quality: 88, mozjpeg: true })
      .toFile(path.join(outputDir, "back-label-blurred.jpg"));
    await fs.rename(
      path.join(outputDir, "back-label-blurred.jpg"),
      path.join(outputDir, "back-label.jpg"),
    );
  }
}

await Promise.all([
  createSample({
    id: "complete-match",
    name: "Complete match",
    intendedOutcome: "pass",
    description: "All extracted application values match the label artwork.",
  }),
  createSample({
    id: "abv-mismatch",
    name: "Alcohol content mismatch",
    intendedOutcome: "mismatch",
    description: "The artwork says 40% Alc./Vol. (80 Proof); the application says 45% (90 Proof).",
    alcoholByVolume: 40,
    proof: 80,
  }),
  createSample({
    id: "warning-mismatch",
    name: "Government warning mismatch",
    intendedOutcome: "mismatch",
    description: "The required warning text is intentionally changed on the back label.",
    warning: warningBody.replace("health problems.", "serious health problems."),
  }),
  createSample({
    id: "needs-review",
    name: "Unreadable warning",
    intendedOutcome: "needs_review",
    description: "The back-label warning is intentionally blurred to require human review.",
    blurBackLabel: true,
  }),
]);

console.log(`Generated prepared sample assets in ${samplesDir}`);
