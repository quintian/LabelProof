import { describe, expect, it } from "vitest";

import type {
  ApplicationObservation,
  LabelObservation,
} from "@/lib/contracts/extraction";

import { compareBrandName, normalizeBrandName } from "./brand";

type ApplicationBrand = ApplicationObservation["brandName"];
type LabelBrand = LabelObservation["brandName"];

const applicationBrand = (
  value: string | null,
  readability: ApplicationBrand["readability"] = "clear",
): ApplicationBrand => ({
  value,
  verbatimText: value,
  readability,
  source: value === null ? "none" : "application_pdf",
});

const labelBrand = (
  value: string | null,
  readability: LabelBrand["readability"] = "clear",
): LabelBrand => ({
  value,
  verbatimText: value,
  readability,
  source: value === null ? "none" : "front_label",
});

describe("normalizeBrandName", () => {
  it("ignores case, whitespace, apostrophes, and punctuation", () => {
    expect(normalizeBrandName("  Stone’s—Throw! ")).toBe("stonesthrow");
    expect(normalizeBrandName("STONE'S THROW")).toBe("stonesthrow");
  });

  it("does not rewrite meaningful words", () => {
    expect(normalizeBrandName("Oak & Vine")).not.toBe(
      normalizeBrandName("Oak and Vine"),
    );
  });
});

describe("compareBrandName", () => {
  it("passes an exact brand-name match", () => {
    const result = compareBrandName(
      applicationBrand("CIVIC OAK"),
      labelBrand("CIVIC OAK"),
    );

    expect(result.status).toBe("pass");
    expect(result.explanation).toBe("The brand name matches the application.");
  });

  it("passes a match with nonmaterial presentation differences", () => {
    const result = compareBrandName(
      applicationBrand("Stone's Throw"),
      labelBrand("STONE’S—THROW!"),
    );

    expect(result.status).toBe("pass");
    expect(result.expected.evidence?.source).toBe("application_pdf");
    expect(result.detected.evidence?.source).toBe("front_label");
  });

  it("returns a mismatch for a materially different brand", () => {
    const result = compareBrandName(
      applicationBrand("CIVIC OAK"),
      labelBrand("CIVIC PINE"),
    );

    expect(result.status).toBe("mismatch");
  });

  it("sends uncertain label text to review", () => {
    const result = compareBrandName(
      applicationBrand("CIVIC OAK"),
      labelBrand("CIVIC OAK", "uncertain"),
    );

    expect(result.status).toBe("needs_review");
  });

  it("sends a missing label brand to review instead of calling it a mismatch", () => {
    const result = compareBrandName(
      applicationBrand("CIVIC OAK"),
      labelBrand(null, "not_found"),
    );

    expect(result.status).toBe("needs_review");
    expect(result.detected.evidence).toBeNull();
  });

  it("sends an unreadable application brand to review", () => {
    const result = compareBrandName(
      applicationBrand(null, "uncertain"),
      labelBrand("CIVIC OAK"),
    );

    expect(result.status).toBe("needs_review");
  });
});
