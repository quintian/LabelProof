import type {
  ApplicationObservation,
  LabelObservation,
} from "@/lib/contracts/extraction";
import type { FieldResult } from "@/lib/contracts/verification";

type ApplicationClassType = ApplicationObservation["classType"];
type LabelClassType = LabelObservation["classType"];

/**
 * Normalizes presentation without weakening the beverage classification.
 * Words and their order remain significant; punctuation becomes a word break.
 */
export function normalizeClassType(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function applicationEvidence(field: ApplicationClassType) {
  if (field.source === "none" || field.verbatimText === null) {
    return null;
  }

  return {
    verbatimText: field.verbatimText,
    source: field.source,
  };
}

function labelEvidence(field: LabelClassType) {
  if (field.source === "none" || field.verbatimText === null) {
    return null;
  }

  return {
    verbatimText: field.verbatimText,
    source: field.source,
  };
}

function resultBase(
  expected: ApplicationClassType,
  detected: LabelClassType,
) {
  return {
    field: "class_type" as const,
    label: "Class/type designation",
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

export function compareClassType(
  expected: ApplicationClassType,
  detected: LabelClassType,
): FieldResult {
  const base = resultBase(expected, detected);

  if (expected.readability !== "clear" || expected.value === null) {
    return {
      ...base,
      status: "needs_review",
      explanation:
        "The application class/type designation could not be read reliably. Confirm it before comparing the label.",
    };
  }

  if (detected.readability === "not_found" || detected.value === null) {
    return {
      ...base,
      status: "needs_review",
      explanation:
        "A readable class/type designation was not found on the supplied label artwork.",
    };
  }

  if (detected.readability === "uncertain") {
    return {
      ...base,
      status: "needs_review",
      explanation:
        "The label class/type designation could not be read reliably enough to compare.",
    };
  }

  const normalizedExpected = normalizeClassType(expected.value);
  const normalizedDetected = normalizeClassType(detected.value);

  if (normalizedExpected.length === 0 || normalizedDetected.length === 0) {
    return {
      ...base,
      status: "needs_review",
      explanation:
        "The extracted class/type designation did not contain enough readable text to compare.",
    };
  }

  if (normalizedExpected === normalizedDetected) {
    return {
      ...base,
      status: "pass",
      explanation:
        expected.value === detected.value
          ? "The class/type designation matches the application."
          : "The class/type designation matches after ignoring capitalization, spacing, line breaks, and punctuation.",
    };
  }

  return {
    ...base,
    status: "mismatch",
    explanation:
      "The label class/type designation differs from the application designation.",
  };
}
