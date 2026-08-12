import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import {
  documentExtractionSchema,
  type DocumentExtraction,
} from "@/lib/contracts/extraction";

const MODEL = process.env.OPENAI_EXTRACTION_MODEL ?? "gpt-5.6-luna";
const REQUEST_TIMEOUT_MS = 25_000;

const EXTRACTION_INSTRUCTIONS = `
You extract structured observations from an alcohol beverage application PDF and its label artwork.

Source boundaries:
- Extract application observations only from the application PDF.
- Extract label observations only from the label images.
- Do not compare the sources and do not decide whether anything passes.

Rules:
- Copy verbatimText exactly as visibly written, preserving capitalization, punctuation, symbols, and line breaks.
- Put normalized semantic data in value. Numeric values contain only numbers.
- Net contents value uses { amount, unit } and preserves the visible unit.
- Use readability "clear" only for legible, unambiguous text.
- Use "uncertain" with null value when text may be present but cannot be read safely. Never guess.
- Use "not_found" with null value and source "none" when a field is absent.
- Use source "application_pdf" for application fields.
- Use "front_label" for the front artwork, "back_label" for artwork that functions as a back label, and "additional_label" otherwise.
- Beverage category is one of beer, wine, or distilled_spirits and comes only from the application.
- Extract the government warning heading separately from the body.
- The warning body excludes the heading and preserves both numbered clauses verbatim.
`.trim();

type ExtractionFile = {
  name: string;
  mimeType: string;
  bytes: Buffer;
};

export type ExtractionInput = {
  application: ExtractionFile;
  labels: ExtractionFile[];
};

export type ExtractionMetadata = {
  model: string;
  responseId: string;
  modelLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
};

function dataUrl(file: ExtractionFile) {
  return `data:${file.mimeType};base64,${file.bytes.toString("base64")}`;
}

export async function extractDocuments(
  input: ExtractionInput,
): Promise<{ extraction: DocumentExtraction; metadata: ExtractionMetadata }> {
  const client = new OpenAI({
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });

  const labelContent = input.labels.flatMap((label, index) => [
    {
      type: "input_text" as const,
      text:
        index === 0
          ? "Label source 1: front or brand label artwork."
          : `Label source ${index + 1}: back or additional label artwork.`,
    },
    {
      type: "input_image" as const,
      image_url: dataUrl(label),
      detail: "high" as const,
    },
  ]);

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
            text: "Application source: application PDF.",
          },
          {
            type: "input_file",
            filename: input.application.name,
            file_data: dataUrl(input.application),
            detail: "low",
          },
          ...labelContent,
          {
            type: "input_text",
            text: "Return structured observations for the supplied application and label artwork.",
          },
        ],
      },
    ],
    text: {
      format: zodTextFormat(documentExtractionSchema, "labelproof_extraction"),
    },
  });
  const modelLatencyMs = Math.round(performance.now() - startedAt);

  if (!response.output_parsed) {
    throw new Error("The extraction model returned no structured output.");
  }

  return {
    extraction: documentExtractionSchema.parse(response.output_parsed),
    metadata: {
      model: MODEL,
      responseId: response.id,
      modelLatencyMs,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
    },
  };
}
