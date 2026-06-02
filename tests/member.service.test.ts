import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

vi.mock("../src/utils/password.js", () => ({
  hashPassword: vi.fn(async (plain: string) => `hashed:${plain}`),
}));

const repoMocks = vi.hoisted(() => ({
  insertMember: vi.fn(),
  findMemberById: vi.fn(),
  listMembers: vi.fn(),
  updateMember: vi.fn(),
  softDeleteMember: vi.fn(),
  countActiveAdmins: vi.fn(),
}));

vi.mock("../src/repositories/member.repository.js", () => repoMocks);

import {
  createOrganizationAdmin,
  createOrganizationMember,
  deleteOrganizationUser,
  listOrganizationUsers,
  updateOrganizationUser,
} from "../src/services/member.service.js";
import type { AuthPayload } from "../src/types/auth.js";
import { HttpError } from "../src/utils/httpError.js";

const baseInput = {
  name: "Riya",
  email: "riya@mudhro.agency",
  number: "9876543210",
  designation: "PM",
  password: "Strong@123",
};

const now = new Date("2025-01-01T10:00:00.000Z");

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "mem-1",
    organization_id: "org-1",
    name: "Riya",
    email: "riya@mudhro.agency",
    number: "9876543210",
    designation: "PM",
    role: 2,
    status: "active",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

const adminActor: AuthPayload = {
  id: "actor-admin",
  organizationId: "org-1",
  email: "admin@mudhro.agency",
  role: 1,
};

const memberActor: AuthPayload = {
  id: "actor-member",
  organizationId: "org-1",
  email: "member@mudhro.agency",
  role: 2,
};

describe("member service - create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forces role=1 when creating an admin", async () => {
    repoMocks.insertMember.mockResolvedValue(makeRow({ role: 1 }));
    const result = await createOrganizationAdmin("org-1", baseInput);
    expect(repoMocks.insertMember).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ role: 1, organizationId: "org-1" }),
    );
    expect(result.role).toBe(1);
  });

  it("forces role=2 when creating a member", async () => {
    repoMocks.insertMember.mockResolvedValue(makeRow({ role: 2 }));
    const result = await createOrganizationMember("org-1", baseInput);
    expect(repoMocks.insertMember).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ role: 2 }),
    );
    expect(result.role).toBe(2);
  });

  it("never exposes password_hash in the DTO", async () => {
    repoMocks.insertMember.mockResolvedValue({
      ...makeRow({ role: 2 }),
      password_hash: "supersecret",
    });
    const result = await createOrganizationMember("org-1", baseInput);
    expect(Object.keys(result)).not.toContain("password_hash");
    expect(Object.keys(result)).not.toContain("passwordHash");
  });

  it("maps duplicate email to a 409", async () => {
    repoMocks.insertMember.mockRejectedValue({
      code: "23505",
      constraint: "organization_admins_email_lower_unique",
    });
    await expect(createOrganizationMember("org-1", baseInput)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe("member service - list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns DTOs with pagination metadata", async () => {
    repoMocks.listMembers.mockResolvedValue({
      items: [makeRow(), makeRow({ id: "mem-2" })],
      total: 2,
      page: 1,
      limit: 20,
    });
    const result = await listOrganizationUsers("org-1", {
      page: 1,
      limit: 20,
    });
    expect(result.total).toBe(2);
    expect(result.items.map((i) => i.id)).toEqual(["mem-1", "mem-2"]);
    expect(result.items.every((i) => !("password_hash" in i))).toBe(true);
  });
});

describe("member service - update", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows admins to change roles", async () => {
    repoMocks.findMemberById.mockResolvedValue(makeRow({ role: 2 }));
    repoMocks.updateMember.mockResolvedValue(makeRow({ role: 1 }));
    const result = await updateOrganizationUser(
      "org-1",
      "mem-1",
      { role: 1 },
      adminActor,
    );
    expect(repoMocks.updateMember).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "mem-1",
      expect.objectContaining({ role: 1 }),
    );
    expect(result.role).toBe(1);
  });

  it("forbids members from changing roles", async () => {
    repoMocks.findMemberById.mockResolvedValue(makeRow({ role: 2 }));
    await expect(
      updateOrganizationUser("org-1", "mem-1", { role: 1 }, memberActor),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("blocks demoting the last active admin", async () => {
    repoMocks.findMemberById.mockResolvedValue(makeRow({ role: 1 }));
    repoMocks.countActiveAdmins.mockResolvedValue(1);
    await expect(
      updateOrganizationUser("org-1", "mem-1", { role: 2 }, adminActor),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("blocks deactivating the last active admin", async () => {
    repoMocks.findMemberById.mockResolvedValue(makeRow({ role: 1, status: "active" }));
    repoMocks.countActiveAdmins.mockResolvedValue(1);
    await expect(
      updateOrganizationUser("org-1", "mem-1", { status: "inactive" }, adminActor),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("returns 404 if member does not exist", async () => {
    repoMocks.findMemberById.mockResolvedValue(null);
    await expect(
      updateOrganizationUser("org-1", "missing", { name: "x" }, adminActor),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("member service - delete", () => {
  beforeEach(() => vi.clearAllMocks());

  it("soft deletes a regular member", async () => {
    repoMocks.findMemberById.mockResolvedValue(makeRow({ role: 2 }));
    repoMocks.softDeleteMember.mockResolvedValue(true);
    await expect(deleteOrganizationUser("org-1", "mem-1")).resolves.toBeUndefined();
    expect(repoMocks.softDeleteMember).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "mem-1",
    );
  });

  it("prevents deleting the last active admin", async () => {
    repoMocks.findMemberById.mockResolvedValue(makeRow({ role: 1 }));
    repoMocks.countActiveAdmins.mockResolvedValue(1);
    await expect(deleteOrganizationUser("org-1", "mem-1")).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(repoMocks.softDeleteMember).not.toHaveBeenCalled();
  });

  it("allows removing an admin when more admins remain", async () => {
    repoMocks.findMemberById.mockResolvedValue(makeRow({ role: 1 }));
    repoMocks.countActiveAdmins.mockResolvedValue(3);
    repoMocks.softDeleteMember.mockResolvedValue(true);
    await expect(deleteOrganizationUser("org-1", "mem-1")).resolves.toBeUndefined();
  });

  it("returns 404 when the member is not found", async () => {
    repoMocks.findMemberById.mockResolvedValue(null);
    await expect(deleteOrganizationUser("org-1", "missing")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

void HttpError;
