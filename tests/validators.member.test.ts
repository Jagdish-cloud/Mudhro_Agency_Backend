import { describe, expect, it } from "vitest";

import {
  createAdminSchema,
  createMemberSchema,
  listMembersQuerySchema,
  updateMemberSchema,
} from "../src/validators/member.schema.js";

const validUser = {
  name: "Riya Sharma",
  email: "Riya@Mudhro.AGENCY",
  number: "9876543210",
  designation: "Operations Lead",
  password: "Strong@123",
};

describe("member validators", () => {
  it("accepts a well-formed create admin payload and lowercases email", () => {
    const parsed = createAdminSchema.parse(validUser);
    expect(parsed.email).toBe("riya@mudhro.agency");
  });

  it("accepts a well-formed create member payload", () => {
    const parsed = createMemberSchema.parse(validUser);
    expect(parsed.designation).toBe("Operations Lead");
  });

  it("rejects invalid mobile numbers", () => {
    const result = createMemberSchema.safeParse({ ...validUser, number: "1234567890" });
    expect(result.success).toBe(false);
  });

  it("rejects weak passwords", () => {
    const result = createMemberSchema.safeParse({ ...validUser, password: "weakpass" });
    expect(result.success).toBe(false);
  });

  it("requires a valid email", () => {
    const result = createMemberSchema.safeParse({ ...validUser, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("update schema requires at least one field", () => {
    const result = updateMemberSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("update schema rejects invalid role values", () => {
    const result = updateMemberSchema.safeParse({ role: 5 });
    expect(result.success).toBe(false);
  });

  it("list query schema parses numeric role and defaults", () => {
    const parsed = listMembersQuerySchema.parse({ role: "1" });
    expect(parsed.role).toBe(1);
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
  });
});
