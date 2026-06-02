import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

const repoMocks = vi.hoisted(() => ({
  insertAgencyClient: vi.fn(),
  findAgencyClientById: vi.fn(),
  listAgencyClients: vi.fn(),
  updateAgencyClient: vi.fn(),
  softDeleteAgencyClient: vi.fn(),
  countClientActiveInvoices: vi.fn(),
}));

vi.mock("../src/repositories/agencyClient.repository.js", () => repoMocks);

import {
  createAgencyClientService,
  deleteAgencyClientService,
  getAgencyClientService,
  listAgencyClientsService,
  updateAgencyClientService,
} from "../src/services/agencyClient.service.js";

const now = new Date("2026-01-01T10:00:00.000Z");

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cli-1",
    organization_id: "org-1",
    name: "Acme Ltd",
    contact_name: "John Doe",
    email: "billing@acme.test",
    phone: "+911234567890",
    billing_address: "1 Park St, Mumbai",
    gst_number: null,
    pan_number: null,
    state_code: null,
    status: "active",
    notes: null,
    tags: [],
    created_by_org_user_id: "mem-1",
    created_at: now,
    updated_at: now,
    deleted_at: null,
    ...overrides,
  };
}

const createInput = {
  name: "Acme Ltd",
  contactName: "John Doe",
  email: "billing@acme.test",
  phone: "+911234567890",
  billingAddress: "1 Park St, Mumbai",
  gstNumber: undefined,
  panNumber: undefined,
  stateCode: undefined,
  status: "active" as const,
  notes: undefined,
  tags: [] as string[],
};

describe("agencyClient.service - create", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forwards organizationId + createdBy to the repository", async () => {
    repoMocks.insertAgencyClient.mockResolvedValue(makeRow());
    const dto = await createAgencyClientService("org-1", "mem-1", createInput);
    expect(dto.organizationId).toBe("org-1");
    expect(repoMocks.insertAgencyClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ organizationId: "org-1", createdByOrgUserId: "mem-1" }),
    );
  });

  it("derives state_code from GST number when not provided", async () => {
    repoMocks.insertAgencyClient.mockResolvedValue(makeRow({ state_code: "27" }));
    await createAgencyClientService("org-1", "mem-1", {
      ...createInput,
      gstNumber: "27AAECE1234A1Z5",
    });
    expect(repoMocks.insertAgencyClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ stateCode: "27" }),
    );
  });

  it("allows the same client email in different organizations (no global unique enforcement)", async () => {
    repoMocks.insertAgencyClient
      .mockResolvedValueOnce(makeRow({ id: "cli-org1", organization_id: "org-1" }))
      .mockResolvedValueOnce(makeRow({ id: "cli-org2", organization_id: "org-2" }));

    const a = await createAgencyClientService("org-1", "mem-1", createInput);
    const b = await createAgencyClientService("org-2", "mem-2", createInput);

    expect(a.organizationId).toBe("org-1");
    expect(b.organizationId).toBe("org-2");
    expect(a.email).toBe(b.email);
  });
});

describe("agencyClient.service - cross-org isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when fetching a client from another org", async () => {
    repoMocks.findAgencyClientById.mockResolvedValue(null);
    await expect(getAgencyClientService("org-2", "cli-1")).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(repoMocks.findAgencyClientById).toHaveBeenCalledWith(
      expect.anything(),
      "org-2",
      "cli-1",
    );
  });

  it("list filters are scoped to the organizationId", async () => {
    repoMocks.listAgencyClients.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    await listAgencyClientsService("org-9", {
      page: 1,
      limit: 20,
      search: "acme",
      status: "active",
      tag: undefined,
    });
    expect(repoMocks.listAgencyClients).toHaveBeenCalledWith(
      expect.anything(),
      "org-9",
      expect.objectContaining({ search: "acme", status: "active" }),
    );
  });

  it("update returns 404 if not in the organization", async () => {
    repoMocks.findAgencyClientById.mockResolvedValue(null);
    await expect(
      updateAgencyClientService("org-2", "cli-1", { name: "x" }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(repoMocks.updateAgencyClient).not.toHaveBeenCalled();
  });
});

describe("agencyClient.service - soft delete", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks deleting a client with active invoices", async () => {
    repoMocks.findAgencyClientById.mockResolvedValue(makeRow());
    repoMocks.countClientActiveInvoices.mockResolvedValue(2);
    await expect(deleteAgencyClientService("org-1", "cli-1")).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(repoMocks.softDeleteAgencyClient).not.toHaveBeenCalled();
  });

  it("soft deletes when no active invoices remain", async () => {
    repoMocks.findAgencyClientById.mockResolvedValue(makeRow());
    repoMocks.countClientActiveInvoices.mockResolvedValue(0);
    repoMocks.softDeleteAgencyClient.mockResolvedValue(true);
    await expect(deleteAgencyClientService("org-1", "cli-1")).resolves.toBeUndefined();
    expect(repoMocks.softDeleteAgencyClient).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "cli-1",
    );
  });

  it("returns 404 if client does not exist", async () => {
    repoMocks.findAgencyClientById.mockResolvedValue(null);
    await expect(deleteAgencyClientService("org-1", "missing")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
