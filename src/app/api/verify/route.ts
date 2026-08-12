import { NextResponse } from "next/server";
import { z } from "zod";

import { documentExtractionSchema } from "@/lib/contracts/extraction";
import { verifyDocumentExtraction } from "@/lib/verification/overall-result";

const requestSchema = z
  .object({
    extraction: documentExtractionSchema,
    processingTimeMs: z.number().nonnegative().max(120_000),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "invalid_verification_input",
            message: "The reviewed application values could not be validated.",
          },
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      verification: verifyDocumentExtraction(
        parsed.data.extraction,
        parsed.data.processingTimeMs,
      ),
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "verification_failed",
          message: "LabelProof could not verify the reviewed application values.",
        },
      },
      { status: 500 },
    );
  }
}
