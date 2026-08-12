import type {
  ApplicationObservation,
  LabelObservation,
} from "@/lib/contracts/extraction";
import type { FieldResult } from "@/lib/contracts/verification";

type Quantity = NonNullable<ApplicationObservation["netContents"]["value"]>;
type ApplicationNetContents = ApplicationObservation["netContents"];
type LabelNetContents = LabelObservation["netContents"];

const METRIC_TOLERANCE_ML = 0.01;
const FLUID_OUNCE_TOLERANCE_ML = 2;

type SupportedUnit = "mL" | "cL" | "L" | "fl oz";

const UNIT_FACTORS_ML: Record<SupportedUnit, number> = {
  mL: 1,
  cL: 10,
  L: 1000,
  "fl oz": 29.5735295625,
};

export function normalizeNetContentsUnit(unit: string): SupportedUnit | null {
  const key = unit
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[.\s]/g, "");

  if (["ml", "milliliter", "milliliters", "millilitre", "millilitres"].includes(key)) {
    return "mL";
  }

  if (["cl", "centiliter", "centiliters", "centilitre", "centilitres"].includes(key)) {
    return "cL";
  }

  if (["l", "liter", "liters", "litre", "litres"].includes(key)) {
    return "L";
  }

  if (["floz", "fluidounce", "fluidounces"].includes(key)) {
    return "fl oz";
  }

  return null;
}

export function parseNetContents(text: string): Quantity | null {
  const normalizedText = text
    .normalize("NFKC")
    .replace(/\bfl\.\s*oz\.?/giu, "fl oz");
  const match = normalizedText.match(
    /((?:\d[\d,]*(?:\.\d+)?)|(?:\.\d+))\s*(millilit(?:er|re)s?|ml|centilit(?:er|re)s?|cl|lit(?:er|re)s?|l|fluid\s*ounces?|fl\s*oz)\b/iu,
  );

  if (!match) {
    return null;
  }

  const amount = Number(match[1].replace(/,/g, ""));
  const unit = normalizeNetContentsUnit(match[2]);

  if (!Number.isFinite(amount) || amount <= 0 || unit === null) {
    return null;
  }

  return { amount, unit };
}

export function netContentsInMilliliters(quantity: Quantity): number | null {
  const unit = normalizeNetContentsUnit(quantity.unit);

  if (!Number.isFinite(quantity.amount) || quantity.amount <= 0 || unit === null) {
    return null;
  }

  return quantity.amount * UNIT_FACTORS_ML[unit];
}

function applicationEvidence(field: ApplicationNetContents) {
  if (field.source === "none" || field.verbatimText === null) {
    return null;
  }

  return {
    verbatimText: field.verbatimText,
    source: field.source,
  };
}

function labelEvidence(field: LabelNetContents) {
  if (field.source === "none" || field.verbatimText === null) {
    return null;
  }

  return {
    verbatimText: field.verbatimText,
    source: field.source,
  };
}

function displayQuantity(value: Quantity | null): string | null {
  return value === null ? null : `${value.amount} ${value.unit}`;
}

function comparisonTolerance(
  expected: Quantity,
  detected: Quantity,
): number {
  const expectedUnit = normalizeNetContentsUnit(expected.unit);
  const detectedUnit = normalizeNetContentsUnit(detected.unit);

  return expectedUnit === "fl oz" || detectedUnit === "fl oz"
    ? FLUID_OUNCE_TOLERANCE_ML
    : METRIC_TOLERANCE_ML;
}

export function compareNetContents(
  expected: ApplicationNetContents,
  detected: LabelNetContents,
): FieldResult {
  const base = {
    field: "net_contents" as const,
    label: "Net contents",
    expected: {
      displayValue: displayQuantity(expected.value),
      evidence: applicationEvidence(expected),
    },
    detected: {
      displayValue: displayQuantity(detected.value),
      evidence: labelEvidence(detected),
    },
  };

  if (expected.readability !== "clear" || expected.value === null) {
    return {
      ...base,
      status: "needs_review",
      explanation:
        "The application net contents could not be read reliably. Confirm them before comparing the label.",
    };
  }

  const expectedMilliliters = netContentsInMilliliters(expected.value);

  if (expectedMilliliters === null) {
    return {
      ...base,
      status: "needs_review",
      explanation:
        "The application net contents use an unsupported unit or invalid amount.",
    };
  }

  if (detected.readability === "not_found" || detected.value === null) {
    return {
      ...base,
      status: "needs_review",
      explanation:
        "Readable net contents were not found on the supplied label artwork.",
    };
  }

  if (detected.readability === "uncertain") {
    return {
      ...base,
      status: "needs_review",
      explanation:
        "The label net contents could not be read reliably enough to compare.",
    };
  }

  const detectedMilliliters = netContentsInMilliliters(detected.value);

  if (detectedMilliliters === null) {
    return {
      ...base,
      status: "needs_review",
      explanation:
        "The detected net contents use an unsupported unit or invalid amount.",
    };
  }

  const differenceMilliliters = Math.abs(
    expectedMilliliters - detectedMilliliters,
  );

  if (
    differenceMilliliters <= comparisonTolerance(expected.value, detected.value)
  ) {
    const samePresentation =
      expected.value.amount === detected.value.amount &&
      normalizeNetContentsUnit(expected.value.unit) ===
        normalizeNetContentsUnit(detected.value.unit);

    return {
      ...base,
      status: "pass",
      explanation: samePresentation
        ? "The net contents match the application."
        : "The net contents are equivalent after unit conversion.",
    };
  }

  return {
    ...base,
    status: "mismatch",
    explanation: `The label net contents differ from the application by ${Number(differenceMilliliters.toFixed(2))} mL.`,
  };
}
