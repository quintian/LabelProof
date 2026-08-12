import type { LabelObservation } from "@/lib/contracts/extraction";
import type { FieldResult } from "@/lib/contracts/verification";

type LabelWarningField = LabelObservation["governmentWarningHeading"];

export const REQUIRED_WARNING_HEADING = "GOVERNMENT WARNING:";

export const REQUIRED_WARNING_BODY =
  "(1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

/** Layout line wrapping is nonmaterial; wording, case, and punctuation are not. */
export function normalizeWarningLayoutWhitespace(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function labelEvidence(field: LabelWarningField) {
  if (field.source === "none" || field.verbatimText === null) {
    return null;
  }

  return {
    verbatimText: field.verbatimText,
    source: field.source,
  };
}

type WarningComparisonOptions = {
  field: "government_warning_heading" | "government_warning_body";
  label: string;
  expected: string;
  missingExplanation: string;
  uncertainExplanation: string;
  mismatchExplanation: string;
  passExplanation: string;
};

function compareWarningField(
  detected: LabelWarningField,
  options: WarningComparisonOptions,
): FieldResult {
  const base = {
    field: options.field,
    label: options.label,
    expected: {
      displayValue: options.expected,
      evidence: null,
    },
    detected: {
      displayValue: detected.value,
      evidence: labelEvidence(detected),
    },
  };

  if (detected.readability === "not_found" || detected.value === null) {
    return {
      ...base,
      status: "needs_review",
      explanation: options.missingExplanation,
    };
  }

  if (detected.readability === "uncertain") {
    return {
      ...base,
      status: "needs_review",
      explanation: options.uncertainExplanation,
    };
  }

  if (
    normalizeWarningLayoutWhitespace(detected.value) === options.expected
  ) {
    return {
      ...base,
      status: "pass",
      explanation: options.passExplanation,
    };
  }

  return {
    ...base,
    status: "mismatch",
    explanation: options.mismatchExplanation,
  };
}

export function compareGovernmentWarningHeading(
  detected: LabelObservation["governmentWarningHeading"],
): FieldResult {
  return compareWarningField(detected, {
    field: "government_warning_heading",
    label: "Government warning heading",
    expected: REQUIRED_WARNING_HEADING,
    missingExplanation:
      "The required government warning heading was not found reliably. A reviewer must confirm whether it is present.",
    uncertainExplanation:
      "The government warning heading could not be read reliably enough to verify its capitalization and punctuation.",
    mismatchExplanation:
      "The heading must read exactly “GOVERNMENT WARNING:” with uppercase letters and a colon.",
    passExplanation:
      "The government warning heading has the required wording, capitalization, and colon. Boldness requires separate visual review.",
  });
}

export function compareGovernmentWarningBody(
  detected: LabelObservation["governmentWarningBody"],
): FieldResult {
  return compareWarningField(detected, {
    field: "government_warning_body",
    label: "Government warning statement",
    expected: REQUIRED_WARNING_BODY,
    missingExplanation:
      "The required government warning statement was not found reliably. A reviewer must confirm whether it is present.",
    uncertainExplanation:
      "The government warning statement could not be read reliably enough for strict wording verification.",
    mismatchExplanation:
      "The government warning statement differs from the required wording, capitalization, or punctuation.",
    passExplanation:
      "The government warning statement matches the required wording, capitalization, and punctuation.",
  });
}

export function compareGovernmentWarning(
  label: Pick<
    LabelObservation,
    "governmentWarningHeading" | "governmentWarningBody"
  >,
): [FieldResult, FieldResult] {
  return [
    compareGovernmentWarningHeading(label.governmentWarningHeading),
    compareGovernmentWarningBody(label.governmentWarningBody),
  ];
}
