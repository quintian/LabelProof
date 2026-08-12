import type {
  ApplicationObservation,
  LabelObservation,
} from "@/lib/contracts/extraction";
import type { FieldResult } from "@/lib/contracts/verification";

type ApplicationNumberField = ApplicationObservation["alcoholByVolume"];
type LabelNumberField = LabelObservation["alcoholByVolume"];

const NUMERIC_TOLERANCE = 0.001;

export function parseAlcoholByVolume(text: string): number | null {
  const match = text
    .normalize("NFKC")
    .match(/(\d{1,3}(?:\.\d+)?)\s*(?:%|percent\b)/iu);

  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return isValidAbv(value) ? value : null;
}

export function parseProof(text: string): number | null {
  const match = text
    .normalize("NFKC")
    .match(/(\d{1,3}(?:\.\d+)?)\s*°?\s*proof\b/iu);

  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return isValidProof(value) ? value : null;
}

export function isValidAbv(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

export function isValidProof(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 200;
}

export function isProofConsistentWithAbv(
  alcoholByVolume: number,
  proof: number,
): boolean {
  return Math.abs(proof - alcoholByVolume * 2) <= NUMERIC_TOLERANCE;
}

function applicationEvidence(field: ApplicationNumberField) {
  if (field.source === "none" || field.verbatimText === null) {
    return null;
  }

  return {
    verbatimText: field.verbatimText,
    source: field.source,
  };
}

function labelEvidence(field: LabelNumberField) {
  if (field.source === "none" || field.verbatimText === null) {
    return null;
  }

  return {
    verbatimText: field.verbatimText,
    source: field.source,
  };
}

type NumericComparisonOptions = {
  field: "alcohol_by_volume" | "proof";
  label: string;
  unitLabel: string;
  valid: (value: number) => boolean;
};

function compareNumericField(
  expected: ApplicationNumberField,
  detected: LabelNumberField,
  options: NumericComparisonOptions,
): FieldResult {
  const display = (value: number | null) =>
    value === null ? null : `${value}${options.unitLabel}`;
  const base = {
    field: options.field,
    label: options.label,
    expected: {
      displayValue: display(expected.value),
      evidence: applicationEvidence(expected),
    },
    detected: {
      displayValue: display(detected.value),
      evidence: labelEvidence(detected),
    },
  };

  if (expected.readability !== "clear" || expected.value === null) {
    return {
      ...base,
      status: "needs_review",
      explanation: `The application ${options.label.toLowerCase()} could not be read reliably. Confirm it before comparing the label.`,
    };
  }

  if (!options.valid(expected.value)) {
    return {
      ...base,
      status: "needs_review",
      explanation: `The application ${options.label.toLowerCase()} is outside the valid numeric range.`,
    };
  }

  if (detected.readability === "not_found" || detected.value === null) {
    return {
      ...base,
      status: "needs_review",
      explanation: `A readable ${options.label.toLowerCase()} was not found on the supplied label artwork.`,
    };
  }

  if (detected.readability === "uncertain") {
    return {
      ...base,
      status: "needs_review",
      explanation: `The label ${options.label.toLowerCase()} could not be read reliably enough to compare.`,
    };
  }

  if (!options.valid(detected.value)) {
    return {
      ...base,
      status: "needs_review",
      explanation: `The detected ${options.label.toLowerCase()} is outside the valid numeric range.`,
    };
  }

  if (Math.abs(expected.value - detected.value) <= NUMERIC_TOLERANCE) {
    return {
      ...base,
      status: "pass",
      explanation: `The ${options.label.toLowerCase()} matches the application.`,
    };
  }

  return {
    ...base,
    status: "mismatch",
    explanation: `The label ${options.label.toLowerCase()} differs from the application by ${Math.abs(expected.value - detected.value)}${options.unitLabel}.`,
  };
}

export function compareAlcoholByVolume(
  expected: ApplicationObservation["alcoholByVolume"],
  detected: LabelObservation["alcoholByVolume"],
): FieldResult {
  return compareNumericField(expected, detected, {
    field: "alcohol_by_volume",
    label: "Alcohol by volume",
    unitLabel: "%",
    valid: isValidAbv,
  });
}

export function compareProof(
  expected: ApplicationObservation["proof"],
  detected: LabelObservation["proof"],
): FieldResult {
  return compareNumericField(expected, detected, {
    field: "proof",
    label: "Proof",
    unitLabel: " proof",
    valid: isValidProof,
  });
}

type AlcoholContentInput<TField> = {
  alcoholByVolume: TField;
  proof: TField;
};

export function compareAlcoholContent(
  expected: AlcoholContentInput<ApplicationNumberField>,
  detected: AlcoholContentInput<LabelNumberField>,
): [FieldResult, FieldResult] {
  const alcoholByVolumeResult = compareAlcoholByVolume(
    expected.alcoholByVolume,
    detected.alcoholByVolume,
  );
  let proofResult = compareProof(expected.proof, detected.proof);

  const expectedRelationshipIsCheckable =
    expected.alcoholByVolume.readability === "clear" &&
    expected.proof.readability === "clear" &&
    expected.alcoholByVolume.value !== null &&
    expected.proof.value !== null &&
    isValidAbv(expected.alcoholByVolume.value) &&
    isValidProof(expected.proof.value);

  if (
    expectedRelationshipIsCheckable &&
    !isProofConsistentWithAbv(
      expected.alcoholByVolume.value!,
      expected.proof.value!,
    )
  ) {
    proofResult = {
      ...proofResult,
      status: "needs_review",
      explanation:
        "The application proof is not twice its alcohol-by-volume value. Confirm the application values.",
    };

    return [alcoholByVolumeResult, proofResult];
  }

  const detectedRelationshipIsCheckable =
    detected.alcoholByVolume.readability === "clear" &&
    detected.proof.readability === "clear" &&
    detected.alcoholByVolume.value !== null &&
    detected.proof.value !== null &&
    isValidAbv(detected.alcoholByVolume.value) &&
    isValidProof(detected.proof.value);

  if (
    detectedRelationshipIsCheckable &&
    proofResult.status === "pass" &&
    !isProofConsistentWithAbv(
      detected.alcoholByVolume.value!,
      detected.proof.value!,
    )
  ) {
    proofResult = {
      ...proofResult,
      status: "needs_review",
      explanation:
        "The detected proof is not twice the detected alcohol-by-volume value. Review the label extraction.",
    };
  }

  return [alcoholByVolumeResult, proofResult];
}
