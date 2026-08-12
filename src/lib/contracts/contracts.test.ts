import { describe, expect, it } from "vitest";

import { documentExtractionSchema } from "./extraction";
import { verificationResultSchema } from "./verification";

const applicationField = <T>(value: T, verbatimText: string) => ({
  value,
  verbatimText,
  readability: "clear" as const,
  source: "application_pdf" as const,
});

const labelField = <T>(value: T, verbatimText: string, source = "front_label") => ({
  value,
  verbatimText,
  readability: "clear" as const,
  source,
});

const extractionFixture = {
  application: {
    beverageCategory: applicationField("distilled_spirits", "Distilled Spirits"),
    brandName: applicationField("CIVIC OAK", "CIVIC OAK"),
    fancifulName: applicationField("FOUNDERS RESERVE", "FOUNDERS RESERVE"),
    classType: applicationField(
      "Kentucky Straight Bourbon Whiskey",
      "Kentucky Straight Bourbon Whiskey",
    ),
    alcoholByVolume: applicationField(45, "45% Alc./Vol."),
    proof: applicationField(90, "90 Proof"),
    netContents: applicationField({ amount: 750, unit: "mL" }, "750 mL"),
  },
  label: {
    brandName: labelField("CIVIC OAK", "CIVIC OAK"),
    fancifulName: labelField("FOUNDERS RESERVE", "FOUNDERS RESERVE"),
    classType: labelField(
      "Kentucky Straight Bourbon Whiskey",
      "Kentucky Straight\nBOURBON WHISKEY",
    ),
    alcoholByVolume: labelField(45, "45% ALC./VOL."),
    proof: labelField(90, "(90 PROOF)"),
    netContents: labelField({ amount: 750, unit: "mL" }, "750 mL"),
    governmentWarningHeading: labelField(
      "GOVERNMENT WARNING:",
      "GOVERNMENT WARNING:",
      "back_label",
    ),
    governmentWarningBody: labelField(
      "Warning body",
      "Warning body",
      "back_label",
    ),
  },
};

describe("document extraction contract", () => {
  it("accepts separate application and label observations", () => {
    expect(documentExtractionSchema.parse(extractionFixture)).toEqual(
      extractionFixture,
    );
  });

  it("rejects model-reported confidence that is not part of the contract", () => {
    const withConfidence = structuredClone(extractionFixture) as typeof extractionFixture & {
      application: typeof extractionFixture.application & {
        brandName: typeof extractionFixture.application.brandName & {
          confidence: number;
        };
      };
    };
    withConfidence.application.brandName.confidence = 0.99;

    expect(documentExtractionSchema.safeParse(withConfidence).success).toBe(
      false,
    );
  });

  it("rejects a label observation attributed to the application PDF", () => {
    const wrongSource = structuredClone(extractionFixture);
    wrongSource.label.brandName.source = "application_pdf";

    expect(documentExtractionSchema.safeParse(wrongSource).success).toBe(false);
  });

  it("accepts a reviewer-corrected application field with explicit provenance", () => {
    const corrected = {
      ...extractionFixture,
      application: {
        ...extractionFixture.application,
        brandName: {
          value: "CIVIC OAK RESERVE",
          verbatimText: "CIVIC OAK RESERVE",
          readability: "clear" as const,
          source: "reviewer_input" as const,
        },
      },
    };

    expect(documentExtractionSchema.safeParse(corrected).success).toBe(true);
  });
});

describe("verification result contract", () => {
  it("accepts an explainable field result", () => {
    const result = {
      overallStatus: "pass",
      summary: {
        passCount: 1,
        mismatchCount: 0,
        needsReviewCount: 0,
      },
      fields: [
        {
          field: "brand_name",
          label: "Brand name",
          expected: {
            displayValue: "CIVIC OAK",
            evidence: {
              verbatimText: "CIVIC OAK",
              source: "application_pdf",
            },
          },
          detected: {
            displayValue: "CIVIC OAK",
            evidence: {
              verbatimText: "CIVIC OAK",
              source: "front_label",
            },
          },
          status: "pass",
          explanation: "The brand names match.",
        },
      ],
      processingTimeMs: 7781,
    };

    expect(verificationResultSchema.parse(result)).toEqual(result);
  });

  it("rejects an unsupported binary failure status", () => {
    const result = {
      overallStatus: "fail",
      summary: {
        passCount: 0,
        mismatchCount: 0,
        needsReviewCount: 0,
      },
      fields: [],
      processingTimeMs: 1,
    };

    expect(verificationResultSchema.safeParse(result).success).toBe(false);
  });
});
