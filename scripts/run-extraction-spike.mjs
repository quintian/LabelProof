import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

const SAMPLE_DIRECTORY = path.join(
  process.cwd(),
  "public/samples/complete-match",
);
const MODEL = process.env.OPENAI_EXTRACTION_MODEL ?? "gpt-5.6-luna";
const REPORT_DIRECTORY = path.join(process.cwd(), "artifacts/spikes");

const Readability = z.enum(["clear", "uncertain", "not_found"]);
const Source = z.enum([
  "application_pdf",
  "front_label",
  "back_label",
  "none",
]);

const TextObservation = z.object({
  value: z.string().nullable(),
  verbatimText: z.string().nullable(),
  readability: Readability,
  source: Source,
});

const NumberObservation = z.object({
  value: z.number().nullable(),
  verbatimText: z.string().nullable(),
  readability: Readability,
  source: Source,
});

const QuantityObservation = z.object({
  value: z.number().nullable(),
  unit: z.string().nullable(),
  verbatimText: z.string().nullable(),
  readability: Readability,
  source: Source,
});

const DocumentObservations = z.object({
  beverageCategory: TextObservation,
  brandName: TextObservation,
  fancifulName: TextObservation,
  classType: TextObservation,
  alcoholByVolume: NumberObservation,
  proof: NumberObservation,
  netContents: QuantityObservation,
});

const ExtractionResult = z.object({
  application: DocumentObservations,
  label: DocumentObservations.extend({
    governmentWarningHeading: TextObservation,
    governmentWarningBody: TextObservation,
  }),
});

const EXTRACTION_INSTRUCTIONS = `
You extract observations from an alcohol beverage application and its label artwork.

Source boundaries:
- Extract application observations only from the application PDF.
- Extract label observations only from the front and back label images.
- Do not compare the application with the labels and do not decide compliance.

Extraction rules:
- Copy verbatimText exactly as visibly written, preserving capitalization, punctuation, spacing, units, and symbols.
- Put a normalized semantic value in value. Numeric fields must contain only the number (for example 45, not "45%").
- For net contents, place the numeric amount in value and the visible unit in unit.
- Use readability "clear" only when the relevant text is legible and unambiguous.
- Use "uncertain" with a null value when text may be present but cannot be read safely. Do not guess.
- Use "not_found" with a null value when the field is absent from that source.
- Use source "none" whenever readability is "not_found".
- Treat a bourbon application as beverageCategory "distilled_spirits".
- Extract the government warning heading separately from its body.
- The warning body must exclude the heading and preserve the numbered clauses and punctuation verbatim.
`.trim();

function asDataUrl(mimeType, bytes) {
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

function normalizeText(value) {
  return value
    ?.normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function textCheck(field, expected, actual) {
  return {
    field,
    expected,
    actual,
    passed: normalizeText(expected) === normalizeText(actual),
  };
}

function numberCheck(field, expected, actual) {
  return {
    field,
    expected,
    actual,
    passed: typeof actual === "number" && Math.abs(expected - actual) < 0.001,
  };
}

function buildBenchmark(expected, extraction) {
  const application = extraction.application;
  const label = extraction.label;
  const checks = [
    textCheck("application.beverageCategory", expected.beverageCategory, application.beverageCategory.value),
    textCheck("application.brandName", expected.brandName, application.brandName.value),
    textCheck("application.fancifulName", expected.fancifulName, application.fancifulName.value),
    textCheck("application.classType", expected.classType, application.classType.value),
    numberCheck("application.alcoholByVolume", expected.alcoholByVolume, application.alcoholByVolume.value),
    numberCheck("application.proof", expected.proof, application.proof.value),
    numberCheck("application.netContents.value", expected.netContents.value, application.netContents.value),
    textCheck("application.netContents.unit", expected.netContents.unit, application.netContents.unit),
    textCheck("label.brandName", expected.brandName, label.brandName.value),
    textCheck("label.fancifulName", expected.fancifulName, label.fancifulName.value),
    textCheck("label.classType", expected.classType, label.classType.value),
    numberCheck("label.alcoholByVolume", expected.alcoholByVolume, label.alcoholByVolume.value),
    numberCheck("label.proof", expected.proof, label.proof.value),
    numberCheck("label.netContents.value", expected.netContents.value, label.netContents.value),
    textCheck("label.netContents.unit", expected.netContents.unit, label.netContents.unit),
  ];

  checks.push(
    textCheck(
      "label.governmentWarningHeading",
      expected.governmentWarningHeading,
      extraction.label.governmentWarningHeading.verbatimText,
    ),
    textCheck(
      "label.governmentWarningBody",
      expected.governmentWarningBody,
      extraction.label.governmentWarningBody.verbatimText,
    ),
  );

  return {
    passed: checks.filter((check) => check.passed).length,
    total: checks.length,
    checks,
  };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is missing. Add it to .env.local before running the spike.",
    );
  }

  const [applicationPdf, frontLabel, backLabel, manifestBytes] =
    await Promise.all([
      readFile(path.join(SAMPLE_DIRECTORY, "application.pdf")),
      readFile(path.join(SAMPLE_DIRECTORY, "front-label.jpg")),
      readFile(path.join(SAMPLE_DIRECTORY, "back-label.jpg")),
      readFile(path.join(SAMPLE_DIRECTORY, "manifest.json")),
    ]);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const client = new OpenAI();

  console.log(`Running structured extraction with ${MODEL}...`);
  const startedAt = performance.now();
  const response = await client.responses.parse({
    model: MODEL,
    reasoning: { effort: "none" },
    instructions: EXTRACTION_INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Application source: synthetic TTB-style application PDF.",
          },
          {
            type: "input_file",
            filename: "application.pdf",
            file_data: asDataUrl("application/pdf", applicationPdf),
            detail: "low",
          },
          {
            type: "input_text",
            text: "Label source: front label artwork.",
          },
          {
            type: "input_image",
            image_url: asDataUrl("image/jpeg", frontLabel),
            detail: "high",
          },
          {
            type: "input_text",
            text: "Label source: back label artwork.",
          },
          {
            type: "input_image",
            image_url: asDataUrl("image/jpeg", backLabel),
            detail: "high",
          },
          {
            type: "input_text",
            text: "Return the structured observations for these three supplied documents.",
          },
        ],
      },
    ],
    text: {
      format: zodTextFormat(ExtractionResult, "labelproof_extraction"),
    },
  });
  const latencyMs = Math.round(performance.now() - startedAt);

  if (!response.output_parsed) {
    throw new Error(`The model returned no parsed output (status: ${response.status}).`);
  }

  const extraction = ExtractionResult.parse(response.output_parsed);
  const benchmark = buildBenchmark(manifest.expected, extraction);
  const generatedAt = new Date().toISOString();
  const report = {
    generatedAt,
    sampleId: manifest.id,
    model: MODEL,
    responseId: response.id,
    responseStatus: response.status,
    latencyMs,
    usage: response.usage,
    benchmark,
    extraction,
  };

  await mkdir(REPORT_DIRECTORY, { recursive: true });
  const safeModelName = MODEL.replace(/[^a-zA-Z0-9._-]/g, "-");
  const safeTimestamp = generatedAt.replace(/[:.]/g, "-");
  const reportPath = path.join(
    REPORT_DIRECTORY,
    `${manifest.id}-${safeModelName}-${safeTimestamp}.json`,
  );
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    `Completed in ${(latencyMs / 1000).toFixed(2)}s; benchmark ${benchmark.passed}/${benchmark.total}.`,
  );
  console.log(`Report: ${path.relative(process.cwd(), reportPath)}`);
  for (const check of benchmark.checks.filter((item) => !item.passed)) {
    console.log(`MISS ${check.field}: expected ${JSON.stringify(check.expected)}, received ${JSON.stringify(check.actual)}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Extraction spike failed: ${message}`);
  process.exitCode = 1;
});
