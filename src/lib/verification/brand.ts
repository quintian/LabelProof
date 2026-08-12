import type {
  ApplicationObservation,
  LabelObservation,
} from "@/lib/contracts/extraction";
import type { FieldResult } from "@/lib/contracts/verification";

type ApplicationBrand = ApplicationObservation["brandName"];
type LabelBrand = LabelObservation["brandName"];

/**
 * Produces a conservative comparison key for brand names.
 *
 * Case, Unicode presentation, whitespace, and punctuation are nonmaterial.
 * Letters and numbers remain significant; this intentionally does not perform
 * fuzzy matching or rewrite words such as "and" and "&".
 */
export function normalizeBrandName(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function applicationEvidence(field: ApplicationBrand) {
  if (field.source === "none" || field.verbatimText === null) {
    return null;
  }

  return {
    verbatimText: field.verbatimText,
    source: field.source,
  };
}

function labelEvidence(field: LabelBrand) {
  if (field.source === "none" || field.verbatimText === null) {
    return null;
  }

  return {
    verbatimText: field.verbatimText,
    source: field.source,
  };
}

function resultBase(expected: ApplicationBrand, detected: LabelBrand) {
  return {
    field: "brand_name" as const,
    label: "Brand name",
    expected: {
      displayValue: expected.value,
      evidence: applicationEvidence(expected),
    },
    detected: {
      displayValue: detected.value,
      evidence: labelEvidence(detected),
    },
  };
}

export function compareBrandName(
  expected: ApplicationBrand,
  detected: LabelBrand,
): FieldResult {
  const base = resultBase(expected, detected);

  if (expected.readability !== "clear" || expected.value === null) {
    return {
      ...base,
      status: "needs_review",
      explanation:
        "The application brand name could not be read reliably. Confirm it before comparing the label.",
    };
  }

  if (detected.readability === "not_found" || detected.value === null) {
    return {
      ...base,
      status: "needs_review",
      explanation:
        "A readable brand name was not found on the supplied label artwork.",
    };
  }

  if (detected.readability === "uncertain") {
    return {
      ...base,
      status: "needs_review",
      explanation:
        "The label brand name could not be read reliably enough to compare.",
    };
  }

  const normalizedExpected = normalizeBrandName(expected.value);
  const normalizedDetected = normalizeBrandName(detected.value);

  if (normalizedExpected.length === 0 || normalizedDetected.length === 0) {
    return {
      ...base,
      status: "needs_review",
      explanation:
        "The extracted brand name did not contain enough readable text to compare.",
    };
  }

  if (normalizedExpected === normalizedDetected) {
    return {
      ...base,
      status: "pass",
      explanation:
        expected.value === detected.value
          ? "The brand name matches the application."
          : "The brand name matches after ignoring capitalization, spacing, and punctuation.",
    };
  }

  return {
    ...base,
    status: "mismatch",
    explanation: "The label brand name differs from the application brand name.",
  };
}
