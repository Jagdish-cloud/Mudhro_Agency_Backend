import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

vi.mock("../src/utils/password.js", () => ({
  hashPassword: vi.fn(async (plain: string) => `hashed:${plain}`),
}));

const repoMocks = vi.hoisted(() => ({
  findMemberById: vi.fn(),
  updateMember: vi.fn(),
  getAdminPasswordHashById: vi.fn(),
  updateAdminPasswordHashById: vi.fn(),
  insertMember: vi.fn(),
  listMembers: vi.fn(),
  softDeleteMember: vi.fn(),
  countActiveAdmins: vi.fn(),
}));

vi.mock("../src/repositories/member.repository.js", () => repoMocks);

const bcryptMocks = vi.hoisted(() => ({
  compare: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: bcryptMocks,
  ...bcryptMocks,
}));

import {
  changeMyPasswordService,
  getMyProfileService,
  updateMyProfileService,
} from "../src/services/profile.service.js";
import type { AuthPayload } from "../src/types/auth.js";

const now = new Date("2025-01-01T10:00:00.000Z");

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "mem-1",
    organization_id: "org-1",
    name: "Riya",
    email: "riya@mudhro.agency",
    number: "9876543210",
    designation: "PM",
    role: 1,
    status: "active",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

const actor: AuthPayload = {
  id: "mem-1",
  organizationId: "org-1",
  email: "riya@mudhro.agency",
  role: 1,
};

describe("profile service - getMyProfileService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a DTO without password_hash", async () => {
    repoMocks.findMemberById.mockResolvedValue({ ...makeRow(), password_hash: "secret" });
    const result = await getMyProfileService(actor);
    expect(Object.keys(result)).not.toContain("password_hash");
    expect(Object.keys(result)).not.toContain("passwordHash");
    expect(result.id).toBe("mem-1");
  });

  it("throws 401 if the user is gone", async () => {
    repoMocks.findMemberById.mockResolvedValue(null);
    await expect(getMyProfileService(actor)).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("profile service - updateMyProfileService", () => {
  beforeEach(() => vi.clearAllMocks());

  const memberActor: AuthPayload = {
    id: "mem-2",
    organizationId: "org-1",
    email: "member@mudhro.agency",
    role: 2,
  };

  it("passes name/number/designation through to repo for admins", async () => {
    repoMocks.updateMember.mockResolvedValue(makeRow({ name: "Riya Kumar" }));
    await updateMyProfileService(actor, {
      name: "Riya Kumar",
      number: "9876543210",
      designation: "Senior PM",
    });
    expect(repoMocks.updateMember).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "mem-1",
      {
        name: "Riya Kumar",
        number: "9876543210",
        designation: "Senior PM",
      },
    );
  });

  it("strips designation from the patch when actor is a Member (role=2)", async () => {
    repoMocks.updateMember.mockResolvedValue(makeRow({ id: "mem-2", role: 2 }));
    await updateMyProfileService(memberActor, {
      name: "Ravi",
      number: "9876543210",
      designation: "Trying to change",
    });
    const patch = repoMocks.updateMember.mock.calls[0][3];
    expect(patch).toEqual({ name: "Ravi", number: "9876543210" });
    expect(patch).not.toHaveProperty("designation");
  });

  it("does not call updateMember when a Member only sent a designation (no changeable fields)", async () => {
    repoMocks.findMemberById.mockResolvedValue(makeRow({ id: "mem-2", role: 2 }));
    await updateMyProfileService(memberActor, { designation: "Ignored" });
    expect(repoMocks.updateMember).not.toHaveBeenCalled();
    expect(repoMocks.findMemberById).toHaveBeenCalled();
  });

  it("does not include email/role/status even if repo layer got them (service-level guarantee)", async () => {
    repoMocks.updateMember.mockResolvedValue(makeRow());
    await updateMyProfileService(actor, { name: "Only name" });
    const patch = repoMocks.updateMember.mock.calls[0][3];
    expect(patch).not.toHaveProperty("email");
    expect(patch).not.toHaveProperty("role");
    expect(patch).not.toHaveProperty("status");
    expect(patch).not.toHaveProperty("organizationId");
  });

  it("omits password_hash in returned DTO", async () => {
    repoMocks.updateMember.mockResolvedValue({ ...makeRow(), password_hash: "secret" });
    const result = await updateMyProfileService(actor, { name: "Riya Kumar" });
    expect(Object.keys(result)).not.toContain("password_hash");
  });

  it("throws 401 if the user was removed", async () => {
    repoMocks.updateMember.mockResolvedValue(null);
    await expect(
      updateMyProfileService(actor, { name: "Riya Kumar" }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("profile service - changeMyPasswordService", () => {
  beforeEach(() => vi.clearAllMocks());

  const input = {
    currentPassword: "OldP@ss1",
    newPassword: "NewStrong@123",
    confirmPassword: "NewStrong@123",
  };

  it("updates the hash when current password matches", async () => {
    repoMocks.getAdminPasswordHashById.mockResolvedValue("current-hash");
    bcryptMocks.compare.mockResolvedValue(true);
    repoMocks.updateAdminPasswordHashById.mockResolvedValue(true);

    await expect(changeMyPasswordService(actor, input)).resolves.toBeUndefined();
    expect(bcryptMocks.compare).toHaveBeenCalledWith("OldP@ss1", "current-hash");
    expect(repoMocks.updateAdminPasswordHashById).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "mem-1",
      "hashed:NewStrong@123",
    );
  });

  it("rejects with 401 when current password is wrong", async () => {
    repoMocks.getAdminPasswordHashById.mockResolvedValue("current-hash");
    bcryptMocks.compare.mockResolvedValue(false);
    await expect(changeMyPasswordService(actor, input)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(repoMocks.updateAdminPasswordHashById).not.toHaveBeenCalled();
  });

  it("rejects with 401 when the user no longer exists", async () => {
    repoMocks.getAdminPasswordHashById.mockResolvedValue(null);
    await expect(changeMyPasswordService(actor, input)).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});
