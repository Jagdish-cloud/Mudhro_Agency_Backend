import { describe, expect, it } from "vitest";

import {
  changePasswordSchema,
  updateSelfProfileSchema,
} from "../src/validators/profile.schema.js";

describe("updateSelfProfileSchema", () => {
  it("accepts a single-field patch", () => {
    const parsed = updateSelfProfileSchema.parse({ name: "Riya" });
    expect(parsed).toEqual({ name: "Riya" });
  });

  it("rejects empty patch", () => {
    const result = updateSelfProfileSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects an invalid mobile number", () => {
    const result = updateSelfProfileSchema.safeParse({ number: "1234" });
    expect(result.success).toBe(false);
  });

  it("rejects disallowed fields (role, status, email)", () => {
    const result = updateSelfProfileSchema.safeParse({
      name: "Ok",
      role: 1,
      status: "inactive",
      email: "x@y.com",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid name+number+designation patch", () => {
    const parsed = updateSelfProfileSchema.parse({
      name: "Riya",
      number: "9876543210",
      designation: "PM",
    });
    expect(parsed.name).toBe("Riya");
    expect(parsed.number).toBe("9876543210");
    expect(parsed.designation).toBe("PM");
  });
});

describe("changePasswordSchema", () => {
  const valid = {
    currentPassword: "OldP@ss1",
    newPassword: "NewStrong@123",
    confirmPassword: "NewStrong@123",
  };

  it("accepts a well-formed payload", () => {
    expect(changePasswordSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects when passwords don't match", () => {
    const result = changePasswordSchema.safeParse({
      ...valid,
      confirmPassword: "Different@123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when new equals current", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "Same@1234",
      newPassword: "Same@1234",
      confirmPassword: "Same@1234",
    });
    expect(result.success).toBe(false);
  });

  it("rejects weak new password", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "OldP@ss1",
      newPassword: "short",
      confirmPassword: "short",
    });
    expect(result.success).toBe(false);
  });

  it("requires current password", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "",
      newPassword: "NewStrong@123",
      confirmPassword: "NewStrong@123",
    });
    expect(result.success).toBe(false);
  });
});
