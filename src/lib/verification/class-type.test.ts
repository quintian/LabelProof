import { describe, expect, it } from "vitest";

import type {
  ApplicationObservation,
  LabelObservation,
} from "@/lib/contracts/extraction";

import { compareClassType, normalizeClassType } from "./class-type";

type ApplicationClassType = ApplicationObservation["classType"];
type LabelClassType = LabelObservation["classType"];

const applicationClassType = (
  value: string | null,
  readability: ApplicationClassType["readability"] = "clear",
): ApplicationClassType => ({
  value,
  verbatimText: value,
  readability,
  source: value === null ? "none" : "application_pdf",
});

const labelClassType = (
  value: string | null,
  readability: LabelClassType["readability"] = "clear",
): LabelClassType => ({
  value,
  verbatimText: value,
  readability,
  source: value === null ? "none" : "front_label",
});

describe("normalizeClassType", () => {
  it("normalizes case, punctuation, line breaks, and repeated spacing", () => {
    expect(
      normalizeClassType(" KENTUCKY—STRAIGHT\n  BOURBON WHISKEY "),
    ).toBe("kentucky straight bourbon whiskey");
  });

  it("keeps classification words significant", () => {
    expect(normalizeClassType("Straight Bourbon Whiskey")).not.toBe(
      normalizeClassType("Straight Rye Whiskey"),
    );
  });
});

describe("compareClassType", () => {
  it("passes an exact designation", () => {
    const result = compareClassType(
      applicationClassType("Kentucky Straight Bourbon Whiskey"),
      labelClassType("Kentucky Straight Bourbon Whiskey"),
    );

    expect(result.status).toBe("pass");
    expect(result.explanation).toBe(
      "The class/type designation matches the application.",
    );
  });

  it("passes nonmaterial label presentation differences", () => {
    const result = compareClassType(
      applicationClassType("Kentucky Straight Bourbon Whiskey"),
      labelClassType("KENTUCKY—STRAIGHT\nBOURBON WHISKEY"),
    );

    expect(result.status).toBe("pass");
    expect(result.detected.evidence?.verbatimText).toContain("\n");
  });

  it("flags a materially different classification", () => {
    const result = compareClassType(
      applicationClassType("Kentucky Straight Bourbon Whiskey"),
      labelClassType("Kentucky Straight Rye Whiskey"),
    );

    expect(result.status).toBe("mismatch");
  });

  it("sends uncertain label text to review", () => {
    const result = compareClassType(
      applicationClassType("Kentucky Straight Bourbon Whiskey"),
      labelClassType("Kentucky Straight Bourbon Whiskey", "uncertain"),
    );

    expect(result.status).toBe("needs_review");
  });

  it("sends a missing label designation to review", () => {
    const result = compareClassType(
      applicationClassType("Kentucky Straight Bourbon Whiskey"),
      labelClassType(null, "not_found"),
    );

    expect(result.status).toBe("needs_review");
    expect(result.detected.evidence).toBeNull();
  });

  it("sends an unreadable application designation to review", () => {
    const result = compareClassType(
      applicationClassType(null, "uncertain"),
      labelClassType("Kentucky Straight Bourbon Whiskey"),
    );

    expect(result.status).toBe("needs_review");
  });
});
