import { describe, expect, it } from "vitest";

import type { LabelObservation } from "@/lib/contracts/extraction";

import {
  compareGovernmentWarning,
  compareGovernmentWarningBody,
  compareGovernmentWarningHeading,
  normalizeWarningLayoutWhitespace,
  REQUIRED_WARNING_BODY,
  REQUIRED_WARNING_HEADING,
} from "./warning";

type LabelWarningField = LabelObservation["governmentWarningHeading"];

const warningField = (
  value: string | null,
  readability: LabelWarningField["readability"] = "clear",
): LabelWarningField => ({
  value,
  verbatimText: value,
  readability,
  source: value === null ? "none" : "back_label",
});

describe("warning whitespace normalization", () => {
  it("removes layout-only line wrapping without changing punctuation or case", () => {
    expect(
      normalizeWarningLayoutWhitespace(
        "(1) According to the Surgeon\nGeneral,  women should not drink.",
      ),
    ).toBe("(1) According to the Surgeon General, women should not drink.");
  });
});

describe("government warning heading", () => {
  it("passes the exact uppercase heading and colon", () => {
    const result = compareGovernmentWarningHeading(
      warningField(REQUIRED_WARNING_HEADING),
    );

    expect(result.status).toBe("pass");
    expect(result.explanation).toContain("Boldness requires separate visual review");
  });

  it("flags capitalization and punctuation differences", () => {
    expect(
      compareGovernmentWarningHeading(
        warningField("Government Warning:"),
      ).status,
    ).toBe("mismatch");
    expect(
      compareGovernmentWarningHeading(
        warningField("GOVERNMENT WARNING"),
      ).status,
    ).toBe("mismatch");
  });

  it("flags a missing heading as a mismatch", () => {
    const result = compareGovernmentWarningHeading(
      warningField(null, "not_found"),
    );

    expect(result.status).toBe("mismatch");
    expect(result.explanation).toContain("absent");
  });
});

describe("government warning body", () => {
  it("passes exact text with label line wrapping", () => {
    const wrapped = REQUIRED_WARNING_BODY.replace(
      "women should not drink",
      "women\nshould not drink",
    );
    const result = compareGovernmentWarningBody(warningField(wrapped));

    expect(result.status).toBe("pass");
  });

  it("flags a missing comma or changed capitalization", () => {
    const missingComma = REQUIRED_WARNING_BODY.replace("machinery,", "machinery");
    const changedCase = REQUIRED_WARNING_BODY.replace(
      "Surgeon General",
      "surgeon general",
    );

    expect(
      compareGovernmentWarningBody(warningField(missingComma)).status,
    ).toBe("mismatch");
    expect(
      compareGovernmentWarningBody(warningField(changedCase)).status,
    ).toBe("mismatch");
  });

  it("routes uncertain text to review rather than guessing", () => {
    const result = compareGovernmentWarningBody(
      warningField(REQUIRED_WARNING_BODY, "uncertain"),
    );

    expect(result.status).toBe("needs_review");
  });

  it("flags a missing warning body as a mismatch", () => {
    const result = compareGovernmentWarningBody(
      warningField(null, "not_found"),
    );

    expect(result.status).toBe("mismatch");
    expect(result.explanation).toContain("absent");
  });

  it("returns separate, explainable heading and body results", () => {
    const [heading, body] = compareGovernmentWarning({
      governmentWarningHeading: warningField(REQUIRED_WARNING_HEADING),
      governmentWarningBody: warningField(REQUIRED_WARNING_BODY),
    });

    expect(heading.field).toBe("government_warning_heading");
    expect(body.field).toBe("government_warning_body");
    expect([heading.status, body.status]).toEqual(["pass", "pass"]);
  });
});
