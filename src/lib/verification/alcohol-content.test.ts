import { describe, expect, it } from "vitest";

import type {
  ApplicationObservation,
  LabelObservation,
} from "@/lib/contracts/extraction";

import {
  compareAlcoholByVolume,
  compareAlcoholContent,
  compareProof,
  isProofConsistentWithAbv,
  parseAlcoholByVolume,
  parseProof,
} from "./alcohol-content";

type ApplicationNumberField = ApplicationObservation["alcoholByVolume"];
type LabelNumberField = LabelObservation["alcoholByVolume"];

const applicationNumber = (
  value: number | null,
  verbatimText: string | null,
  readability: ApplicationNumberField["readability"] = "clear",
): ApplicationNumberField => ({
  value,
  verbatimText,
  readability,
  source: value === null ? "none" : "application_pdf",
});

const labelNumber = (
  value: number | null,
  verbatimText: string | null,
  readability: LabelNumberField["readability"] = "clear",
): LabelNumberField => ({
  value,
  verbatimText,
  readability,
  source: value === null ? "none" : "front_label",
});

describe("alcohol-content parsing", () => {
  it("parses common ABV presentations", () => {
    expect(parseAlcoholByVolume("45% Alc./Vol.")).toBe(45);
    expect(parseAlcoholByVolume("ALCOHOL 12.5 percent BY VOLUME")).toBe(12.5);
  });

  it("parses common proof presentations", () => {
    expect(parseProof("(90 PROOF)")).toBe(90);
    expect(parseProof("101.5° proof")).toBe(101.5);
  });

  it("rejects missing and out-of-range values", () => {
    expect(parseAlcoholByVolume("750 mL")).toBeNull();
    expect(parseAlcoholByVolume("120% Alc./Vol.")).toBeNull();
    expect(parseProof("220 proof")).toBeNull();
  });
});

describe("alcohol-content comparison", () => {
  it("passes matching ABV and preserves display evidence", () => {
    const result = compareAlcoholByVolume(
      applicationNumber(45, "45% Alc./Vol."),
      labelNumber(45, "45% ALC./VOL."),
    );

    expect(result.status).toBe("pass");
    expect(result.expected.displayValue).toBe("45%");
    expect(result.detected.evidence?.verbatimText).toBe("45% ALC./VOL.");
  });

  it("reports a definite ABV mismatch and difference", () => {
    const result = compareAlcoholByVolume(
      applicationNumber(45, "45% Alc./Vol."),
      labelNumber(40, "40% ALC./VOL."),
    );

    expect(result.status).toBe("mismatch");
    expect(result.explanation).toContain("5%");
  });

  it("passes matching proof", () => {
    const result = compareProof(
      applicationNumber(90, "90 Proof"),
      labelNumber(90, "(90 PROOF)"),
    );

    expect(result.status).toBe("pass");
  });

  it("routes missing or uncertain label values to review", () => {
    expect(
      compareAlcoholByVolume(
        applicationNumber(45, "45% Alc./Vol."),
        labelNumber(null, null, "not_found"),
      ).status,
    ).toBe("needs_review");
    expect(
      compareProof(
        applicationNumber(90, "90 Proof"),
        labelNumber(90, "90 PROOF", "uncertain"),
      ).status,
    ).toBe("needs_review");
  });

  it("routes out-of-range extracted values to review", () => {
    const result = compareAlcoholByVolume(
      applicationNumber(45, "45% Alc./Vol."),
      labelNumber(145, "145% Alc./Vol."),
    );

    expect(result.status).toBe("needs_review");
  });
});

describe("ABV/proof relationship", () => {
  it("recognizes the two-to-one proof relationship", () => {
    expect(isProofConsistentWithAbv(45, 90)).toBe(true);
    expect(isProofConsistentWithAbv(45, 80)).toBe(false);
  });

  it("routes internally inconsistent application values to review", () => {
    const [, proofResult] = compareAlcoholContent(
      {
        alcoholByVolume: applicationNumber(45, "45% Alc./Vol."),
        proof: applicationNumber(80, "80 Proof"),
      },
      {
        alcoholByVolume: labelNumber(45, "45% Alc./Vol."),
        proof: labelNumber(80, "80 Proof"),
      },
    );

    expect(proofResult.status).toBe("needs_review");
    expect(proofResult.explanation).toContain("application proof");
  });

  it("keeps a definite proof difference as a mismatch", () => {
    const [, proofResult] = compareAlcoholContent(
      {
        alcoholByVolume: applicationNumber(45, "45% Alc./Vol."),
        proof: applicationNumber(90, "90 Proof"),
      },
      {
        alcoholByVolume: labelNumber(40, "40% Alc./Vol."),
        proof: labelNumber(80, "80 Proof"),
      },
    );

    expect(proofResult.status).toBe("mismatch");
  });
});
