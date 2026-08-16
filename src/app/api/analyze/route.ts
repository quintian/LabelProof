import OpenAI from "openai";
import { NextResponse } from "next/server";

import { extractDocuments } from "@/lib/ai/openai-extractor";
import { verifyDocumentExtraction } from "@/lib/verification/overall-result";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_COMBINED_BYTES = 3 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);

function isFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File;
}

function apiError(message: string, status: number, code: string) {
  return NextResponse.json({ error: { message, code } }, { status });
}

export async function POST(request: Request) {
  const requestStartedAt = performance.now();

  try {
    if (!process.env.OPENAI_API_KEY) {
      return apiError(
        "The analysis service is not configured. Add OPENAI_API_KEY and restart the server.",
        503,
        "service_not_configured",
      );
    }

    const formData = await request.formData();
    const application = formData.get("application");
    const frontLabel = formData.get("frontLabel");
    const additionalLabels = formData.getAll("additionalLabel");

    if (
      !isFile(application) ||
      !isFile(frontLabel) ||
      !isFile(additionalLabels[0] ?? null)
    ) {
      return apiError(
        "An application PDF, front label image, and back label image are required.",
        400,
        "missing_files",
      );
    }

    if (
      application.type !== "application/pdf" &&
      !application.name.toLowerCase().endsWith(".pdf")
    ) {
      return apiError(
        "The application must be a PDF.",
        415,
        "invalid_application_type",
      );
    }

    const labels = [frontLabel, ...additionalLabels.filter(isFile)];

    if (labels.length < 2 || labels.length > 3 || labels.some((file) => !IMAGE_TYPES.has(file.type))) {
      return apiError(
        "Supply front and back PNG or JPEG label images, plus at most one additional image.",
        415,
        "invalid_label_files",
      );
    }

    const combinedBytes =
      application.size + labels.reduce((sum, file) => sum + file.size, 0);

    if (combinedBytes > MAX_COMBINED_BYTES) {
      return apiError(
        "The application and label files must total 3 MB or less.",
        413,
        "files_too_large",
      );
    }

    const [applicationBytes, ...labelBytes] = await Promise.all([
      application.arrayBuffer(),
      ...labels.map((file) => file.arrayBuffer()),
    ]);
    const { extraction, metadata } = await extractDocuments({
      application: {
        name: application.name,
        mimeType: "application/pdf",
        bytes: Buffer.from(applicationBytes),
      },
      labels: labels.map((file, index) => ({
        name: file.name,
        mimeType: file.type,
        bytes: Buffer.from(labelBytes[index]),
      })),
    });
    const processingTimeMs = Math.round(performance.now() - requestStartedAt);
    const verification = verifyDocumentExtraction(extraction, processingTimeMs);

    return NextResponse.json({
      verification,
      extraction,
      metadata,
    });
  } catch (error) {
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      return apiError(
        "Analysis took too long. Try again or use clearer, smaller images.",
        504,
        "analysis_timeout",
      );
    }

    if (error instanceof OpenAI.APIError) {
      if (error.status === 429) {
        return apiError(
          "The analysis service is temporarily at its usage limit. Try again shortly.",
          429,
          "usage_limit",
        );
      }

      return apiError(
        "The extraction service could not analyze these files. Please retry.",
        502,
        "extraction_failed",
      );
    }

    console.error("Label analysis failed", error);
    return apiError(
      "LabelProof could not complete this review. Check the files and try again.",
      500,
      "analysis_failed",
    );
  }
}
