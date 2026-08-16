import { afterEach, describe, expect, it } from "vitest";

import { POST } from "./route";

const originalApiKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (originalApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalApiKey;
  }
});

describe("analysis upload validation", () => {
  it("rejects a submission without a back label before extraction", async () => {
    process.env.OPENAI_API_KEY = "test-only-key";
    const formData = new FormData();
    formData.append(
      "application",
      new File(["application"], "application.pdf", {
        type: "application/pdf",
      }),
    );
    formData.append(
      "frontLabel",
      new File(["front"], "front-label.jpg", { type: "image/jpeg" }),
    );

    const response = await POST(
      new Request("http://labelproof.test/api/analyze", {
        method: "POST",
        body: formData,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("missing_files");
    expect(payload.error.message).toContain("back label");
  });
});
