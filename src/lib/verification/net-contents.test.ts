import { describe, expect, it } from "vitest";

import type {
  ApplicationObservation,
  LabelObservation,
} from "@/lib/contracts/extraction";

import {
  compareNetContents,
  netContentsInMilliliters,
  normalizeNetContentsUnit,
  parseNetContents,
} from "./net-contents";

type Quantity = NonNullable<ApplicationObservation["netContents"]["value"]>;
type ApplicationNetContents = ApplicationObservation["netContents"];
type LabelNetContents = LabelObservation["netContents"];

const applicationQuantity = (
  value: Quantity | null,
  readability: ApplicationNetContents["readability"] = "clear",
): ApplicationNetContents => ({
  value,
  verbatimText: value === null ? null : `${value.amount} ${value.unit}`,
  readability,
  source: value === null ? "none" : "application_pdf",
});

const labelQuantity = (
  value: Quantity | null,
  readability: LabelNetContents["readability"] = "clear",
): LabelNetContents => ({
  value,
  verbatimText: value === null ? null : `${value.amount} ${value.unit}`,
  readability,
  source: value === null ? "none" : "front_label",
});

describe("net-content parsing and normalization", () => {
  it("parses common metric presentations", () => {
    expect(parseNetContents("NET CONTENTS 750 mL")).toEqual({
      amount: 750,
      unit: "mL",
    });
    expect(parseNetContents("1.5 Litres")).toEqual({ amount: 1.5, unit: "L" });
    expect(parseNetContents("70 cL")).toEqual({ amount: 70, unit: "cL" });
  });

  it("parses fluid ounces with punctuation", () => {
    expect(parseNetContents("25.4 FL. OZ.")).toEqual({
      amount: 25.4,
      unit: "fl oz",
    });
  });

  it("normalizes unit names and converts to milliliters", () => {
    expect(normalizeNetContentsUnit("millilitres")).toBe("mL");
    expect(normalizeNetContentsUnit("Liters")).toBe("L");
    expect(netContentsInMilliliters({ amount: 0.75, unit: "L" })).toBe(750);
  });

  it("rejects missing, unsupported, and nonpositive quantities", () => {
    expect(parseNetContents("45% Alc./Vol.")).toBeNull();
    expect(parseNetContents("750 grams")).toBeNull();
    expect(netContentsInMilliliters({ amount: 0, unit: "mL" })).toBeNull();
  });
});

describe("compareNetContents", () => {
  it("passes the same quantity and unit", () => {
    const result = compareNetContents(
      applicationQuantity({ amount: 750, unit: "mL" }),
      labelQuantity({ amount: 750, unit: "mL" }),
    );

    expect(result.status).toBe("pass");
    expect(result.explanation).toBe("The net contents match the application.");
  });

  it("passes equivalent metric units", () => {
    const result = compareNetContents(
      applicationQuantity({ amount: 750, unit: "mL" }),
      labelQuantity({ amount: 0.75, unit: "L" }),
    );

    expect(result.status).toBe("pass");
    expect(result.explanation).toContain("unit conversion");
  });

  it("allows normal fluid-ounce display rounding", () => {
    const result = compareNetContents(
      applicationQuantity({ amount: 750, unit: "mL" }),
      labelQuantity({ amount: 25.4, unit: "fl oz" }),
    );

    expect(result.status).toBe("pass");
  });

  it("reports a definite quantity mismatch", () => {
    const result = compareNetContents(
      applicationQuantity({ amount: 750, unit: "mL" }),
      labelQuantity({ amount: 700, unit: "mL" }),
    );

    expect(result.status).toBe("mismatch");
    expect(result.explanation).toContain("50 mL");
  });

  it("routes an unknown unit to review", () => {
    const result = compareNetContents(
      applicationQuantity({ amount: 750, unit: "mL" }),
      labelQuantity({ amount: 750, unit: "bottles" }),
    );

    expect(result.status).toBe("needs_review");
  });

  it("routes missing and uncertain quantities to review", () => {
    expect(
      compareNetContents(
        applicationQuantity({ amount: 750, unit: "mL" }),
        labelQuantity(null, "not_found"),
      ).status,
    ).toBe("needs_review");
    expect(
      compareNetContents(
        applicationQuantity({ amount: 750, unit: "mL" }),
        labelQuantity({ amount: 750, unit: "mL" }, "uncertain"),
      ).status,
    ).toBe("needs_review");
  });
});
