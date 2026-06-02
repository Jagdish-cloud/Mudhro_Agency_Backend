import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

const repoMocks = vi.hoisted(() => ({
  findAgencyProjectById: vi.fn(),
  insertAgencyProject: vi.fn(),
  updateAgencyProject: vi.fn(),
  replaceClientsForProject: vi.fn(),
  listClientsForProject: vi.fn(),
  assertClientsBelongToOrg: vi.fn(),
}));

vi.mock("../src/repositories/agencyProject.repository.js", () => ({
  findAgencyProjectById: repoMocks.findAgencyProjectById,
  insertAgencyProject: repoMocks.insertAgencyProject,
  updateAgencyProject: repoMocks.updateAgencyProject,
  softDeleteAgencyProject: vi.fn(),
  listAgencyProjectsWithCounts: vi.fn(),
}));

vi.mock("../src/repositories/agencyProjectClient.repository.js", () => ({
  assertClientsBelongToOrg: repoMocks.assertClientsBelongToOrg,
  replaceClientsForProject: repoMocks.replaceClientsForProject,
  listClientsForProject: repoMocks.listClientsForProject,
  removeClientFromProject: vi.fn(),
}));

import {
  assignClientsToProjectService,
  createAgencyProjectService,
  updateAgencyProjectService,
} from "../src/services/agencyProject.service.js";
import { HttpError } from "../src/utils/httpError.js";

const now = new Date("2026-01-10T12:00:00.000Z");

function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "proj-1",
    organization_id: "org-1",
    name: "Alpha",
    description: null,
    start_date: new Date("2026-01-01"),
    end_date: new Date("2026-06-01"),
    status: "active",
    budget: "10000",
    currency: "INR",
    created_by_org_user_id: "adm-1",
    created_at: now,
    updated_at: now,
    deleted_at: null,
    ...overrides,
  };
}

describe("agencyProject.service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("createAgencyProjectService rejects end date before start date", async () => {
    await expect(
      createAgencyProjectService("org-1", "adm-1", {
        name: "X",
        startDate: "2026-02-01",
        endDate: "2026-01-01",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repoMocks.insertAgencyProject).not.toHaveBeenCalled();
  });

  it("createAgencyProjectService replaces clients when clientIds provided", async () => {
    repoMocks.assertClientsBelongToOrg.mockResolvedValue({ ok: true, missing: [] });
    repoMocks.insertAgencyProject.mockResolvedValue(projectRow({ id: "new-proj" }));
    await createAgencyProjectService("org-1", "adm-1", {
      name: "P",
      clientIds: ["c1", "c2"],
    });
    expect(repoMocks.replaceClientsForProject).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "new-proj",
      ["c1", "c2"],
    );
  });

  it("assignClientsToProjectService is idempotent replace", async () => {
    repoMocks.findAgencyProjectById.mockResolvedValue(projectRow());
    repoMocks.assertClientsBelongToOrg.mockResolvedValue({ ok: true, missing: [] });
    repoMocks.listClientsForProject.mockResolvedValue([]);
    await assignClientsToProjectService("org-1", "proj-1", { clientIds: ["a", "b"] });
    expect(repoMocks.replaceClientsForProject).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "proj-1",
      ["a", "b"],
    );
  });

  it("updateAgencyProjectService rejects merged dates when end < start", async () => {
    repoMocks.findAgencyProjectById.mockResolvedValue(
      projectRow({
        start_date: new Date("2026-03-01"),
        end_date: new Date("2026-04-01"),
      }),
    );
    await expect(
      updateAgencyProjectService("org-1", "proj-1", { endDate: "2026-02-01" }),
    ).rejects.toBeInstanceOf(HttpError);
  });
});
