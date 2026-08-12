import type { DocumentExtraction } from "@/lib/contracts/extraction";
import {
  verificationResultSchema,
  type FieldResult,
  type VerificationResult,
  type VerificationStatus,
  type VerificationSummary,
} from "../contracts/verification";

import {
  compareAlcoholByVolume,
  compareAlcoholContent,
} from "./alcohol-content";
import { compareBrandName } from "./brand";
import { compareClassType } from "./class-type";
import { compareNetContents } from "./net-contents";
import { compareGovernmentWarning } from "./warning";

export function summarizeFieldResults(
  fields: readonly FieldResult[],
): VerificationSummary {
  return fields.reduce<VerificationSummary>(
    (summary, field) => {
      if (field.status === "pass") {
        summary.passCount += 1;
      } else if (field.status === "mismatch") {
        summary.mismatchCount += 1;
      } else {
        summary.needsReviewCount += 1;
      }

      return summary;
    },
    { passCount: 0, mismatchCount: 0, needsReviewCount: 0 },
  );
}

export function deriveOverallStatus(
  fields: readonly FieldResult[],
): VerificationStatus {
  if (fields.length === 0) {
    throw new Error("At least one field result is required.");
  }

  if (fields.some((field) => field.status === "mismatch")) {
    return "mismatch";
  }

  if (fields.some((field) => field.status === "needs_review")) {
    return "needs_review";
  }

  return "pass";
}

export function buildVerificationResult(
  fields: FieldResult[],
  processingTimeMs: number,
): VerificationResult {
  return verificationResultSchema.parse({
    overallStatus: deriveOverallStatus(fields),
    summary: summarizeFieldResults(fields),
    fields,
    processingTimeMs,
  });
}

/** Runs deterministic verification over already-validated AI observations. */
export function verifyDocumentExtraction(
  extraction: DocumentExtraction,
  processingTimeMs: number,
): VerificationResult {
  const { application, label } = extraction;
  const fields: FieldResult[] = [
    compareBrandName(application.brandName, label.brandName),
    compareClassType(application.classType, label.classType),
  ];

  const applicationProvidesProof =
    application.proof.readability === "clear" &&
    application.proof.value !== null;

  if (applicationProvidesProof) {
    fields.push(
      ...compareAlcoholContent(
        {
          alcoholByVolume: application.alcoholByVolume,
          proof: application.proof,
        },
        {
          alcoholByVolume: label.alcoholByVolume,
          proof: label.proof,
        },
      ),
    );
  } else {
    fields.push(
      compareAlcoholByVolume(
        application.alcoholByVolume,
        label.alcoholByVolume,
      ),
    );
  }

  fields.push(
    compareNetContents(application.netContents, label.netContents),
    ...compareGovernmentWarning(label),
  );

  return buildVerificationResult(fields, processingTimeMs);
}
