import { describe, expect, it } from "vitest";

import { created, ok } from "../src/utils/responses.js";

describe("response helpers", () => {
  it("wraps data into a success envelope", () => {
    const payload = ok({ id: "1" }, "done");
    expect(payload).toEqual({ success: true, data: { id: "1" }, message: "done" });
  });

  it("created returns the same shape", () => {
    const payload = created({ id: "2" });
    expect(payload.success).toBe(true);
    expect(payload.data).toEqual({ id: "2" });
  });
});
