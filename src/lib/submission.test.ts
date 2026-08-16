import { describe, expect, it } from "vitest";

import { countRequiredDocuments, isSubmissionComplete } from "./submission";

describe("submission completeness", () => {
  it("requires the application, front label, and back label", () => {
    expect(
      isSubmissionComplete({
        application: {},
        frontLabel: {},
        backLabel: null,
      }),
    ).toBe(false);

    expect(
      isSubmissionComplete({
        application: {},
        frontLabel: {},
        backLabel: {},
      }),
    ).toBe(true);
  });

  it("reports partial progress for the upload vessel", () => {
    expect(
      countRequiredDocuments({
        application: {},
        frontLabel: null,
        backLabel: null,
      }),
    ).toBe(1);
  });
});
