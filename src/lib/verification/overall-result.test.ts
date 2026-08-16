import { describe, expect, it } from "vitest";

import type { DocumentExtraction } from "@/lib/contracts/extraction";
import type { FieldResult } from "@/lib/contracts/verification";

import {
  buildVerificationResult,
  deriveOverallStatus,
  summarizeFieldResults,
  verifyDocumentExtraction,
} from "./overall-result";
import {
  REQUIRED_WARNING_BODY,
  REQUIRED_WARNING_HEADING,
} from "./warning";

const fieldResult = (
  status: FieldResult["status"],
  field: FieldResult["field"] = "brand_name",
): FieldResult => ({
  field,
  label: "Test field",
  expected: { displayValue: "Expected", evidence: null },
  detected: { displayValue: "Detected", evidence: null },
  status,
  explanation: "Test explanation.",
});

const applicationField = <T>(value: T, verbatimText: string) => ({
  value,
  verbatimText,
  readability: "clear" as const,
  source: "application_pdf" as const,
});

const labelField = <T>(
  value: T,
  verbatimText: string,
  source: "front_label" | "back_label" = "front_label",
) => ({
  value,
  verbatimText,
  readability: "clear" as const,
  source,
});

const completeMatch: DocumentExtraction = {
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
      REQUIRED_WARNING_HEADING,
      REQUIRED_WARNING_HEADING,
      "back_label",
    ),
    governmentWarningBody: labelField(
      REQUIRED_WARNING_BODY,
      REQUIRED_WARNING_BODY,
      "back_label",
    ),
  },
};

describe("overall status", () => {
  it("passes only when every field passes", () => {
    expect(deriveOverallStatus([fieldResult("pass")])).toBe("pass");
  });

  it("returns needs review when uncertainty exists without a mismatch", () => {
    expect(
      deriveOverallStatus([
        fieldResult("pass"),
        fieldResult("needs_review", "net_contents"),
      ]),
    ).toBe("needs_review");
  });

  it("gives a definite mismatch precedence over uncertainty", () => {
    expect(
      deriveOverallStatus([
        fieldResult("needs_review"),
        fieldResult("mismatch", "class_type"),
      ]),
    ).toBe("mismatch");
  });

  it("rejects an empty result set", () => {
    expect(() => deriveOverallStatus([])).toThrow(
      "At least one field result is required.",
    );
  });

  it("calculates field summary counts", () => {
    expect(
      summarizeFieldResults([
        fieldResult("pass"),
        fieldResult("pass", "proof"),
        fieldResult("mismatch", "class_type"),
        fieldResult("needs_review", "net_contents"),
      ]),
    ).toEqual({ passCount: 2, mismatchCount: 1, needsReviewCount: 1 });
  });
});

describe("full deterministic verification", () => {
  it("passes the complete-match fixture", () => {
    const result = verifyDocumentExtraction(completeMatch, 7781);

    expect(result.overallStatus).toBe("pass");
    expect(result.summary).toEqual({
      passCount: 7,
      mismatchCount: 0,
      needsReviewCount: 0,
    });
    expect(result.processingTimeMs).toBe(7781);
  });

  it("raises an overall mismatch for a definite field difference", () => {
    const mismatch = structuredClone(completeMatch);
    mismatch.label.brandName.value = "CIVIC PINE";
    mismatch.label.brandName.verbatimText = "CIVIC PINE";

    const result = verifyDocumentExtraction(mismatch, 10);

    expect(result.overallStatus).toBe("mismatch");
    expect(result.summary.mismatchCount).toBe(1);
  });

  it("raises needs review when warning text is uncertain", () => {
    const uncertain = structuredClone(completeMatch);
    uncertain.label.governmentWarningBody.readability = "uncertain";

    const result = verifyDocumentExtraction(uncertain, 10);

    expect(result.overallStatus).toBe("needs_review");
    expect(result.summary.needsReviewCount).toBe(1);
  });

  it("raises an overall mismatch when the required warning is absent", () => {
    const missingWarning = structuredClone(completeMatch);
    missingWarning.label.governmentWarningHeading = {
      value: null,
      verbatimText: null,
      readability: "not_found",
      source: "none",
    };
    missingWarning.label.governmentWarningBody = {
      value: null,
      verbatimText: null,
      readability: "not_found",
      source: "none",
    };

    const result = verifyDocumentExtraction(missingWarning, 10);

    expect(result.overallStatus).toBe("mismatch");
    expect(result.summary.mismatchCount).toBe(2);
  });

  it("routes all unreadable front-label fields to review", () => {
    const blurred = structuredClone(completeMatch);
    blurred.label.brandName = { value: null, verbatimText: null, readability: "uncertain", source: "front_label" };
    blurred.label.classType = { value: null, verbatimText: null, readability: "uncertain", source: "front_label" };
    blurred.label.alcoholByVolume = { value: null, verbatimText: null, readability: "uncertain", source: "front_label" };
    blurred.label.proof = { value: null, verbatimText: null, readability: "uncertain", source: "front_label" };
    blurred.label.netContents = { value: null, verbatimText: null, readability: "uncertain", source: "front_label" };

    const result = verifyDocumentExtraction(blurred, 10);

    expect(result.overallStatus).toBe("needs_review");
    expect(result.summary).toEqual({
      passCount: 2,
      mismatchCount: 0,
      needsReviewCount: 5,
    });
  });

  it("omits optional proof when the application does not provide it", () => {
    const withoutProof = structuredClone(completeMatch);
    withoutProof.application.proof = {
      value: null,
      verbatimText: null,
      readability: "not_found",
      source: "none",
    };
    withoutProof.label.proof = {
      value: null,
      verbatimText: null,
      readability: "not_found",
      source: "none",
    };

    const result = verifyDocumentExtraction(withoutProof, 10);

    expect(result.overallStatus).toBe("pass");
    expect(result.fields.some((field) => field.field === "proof")).toBe(false);
    expect(result.summary.passCount).toBe(6);
  });

  it("validates processing time through the result contract", () => {
    expect(() => buildVerificationResult([fieldResult("pass")], -1)).toThrow();
  });
});
