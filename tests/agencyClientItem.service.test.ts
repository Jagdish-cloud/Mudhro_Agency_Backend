import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

const clientRepoMocks = vi.hoisted(() => ({
  findAgencyClientById: vi.fn(),
}));

vi.mock("../src/repositories/agencyClient.repository.js", () => clientRepoMocks);

const itemRepoMocks = vi.hoisted(() => ({
  insertAgencyClientItem: vi.fn(),
  findAgencyClientItemById: vi.fn(),
  listAgencyClientItemsByClient: vi.fn(),
  findByClientNameHsn: vi.fn(),
  updateAgencyClientItem: vi.fn(),
  softDeleteAgencyClientItem: vi.fn(),
}));

vi.mock(
  "../src/repositories/agencyClientItem.repository.js",
  () => itemRepoMocks,
);

import {
  createAgencyClientItemService,
  getAgencyClientItemService,
  listAgencyClientItemsService,
  softDeleteAgencyClientItemService,
  updateAgencyClientItemService,
  upsertClientItemFromRowService,
} from "../src/services/agencyClientItem.service.js";

const now = new Date("2026-01-01T10:00:00.000Z");

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    id: "cli-1",
    organization_id: "org-1",
    name: "Acme",
    contact_name: "",
    email: "",
    phone: "",
    billing_address: "",
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

function makeItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    organization_id: "org-1",
    client_id: "cli-1",
    item_name: "Design services",
    description: null,
    hsn_code: "998314",
    default_rate: "1500.00",
    default_tax_percent: "18.00",
    default_discount_percent: "0.00",
    unit: "hour",
    created_by_org_user_id: "mem-1",
    created_at: now,
    updated_at: now,
    deleted_at: null,
    ...overrides,
  };
}

const createInput = {
  itemName: "Design services",
  description: undefined,
  hsnCode: "998314",
  defaultRate: 1500,
  defaultTaxPercent: 18,
  defaultDiscountPercent: 0,
  unit: "hour",
};

describe("agencyClientItem.service - create", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects when the client does not belong to the org", async () => {
    clientRepoMocks.findAgencyClientById.mockResolvedValue(null);
    await expect(
      createAgencyClientItemService("org-1", "mem-1", "cli-1", createInput),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(itemRepoMocks.insertAgencyClientItem).not.toHaveBeenCalled();
  });

  it("rejects duplicate (name, hsn) on the same client", async () => {
    clientRepoMocks.findAgencyClientById.mockResolvedValue(makeClient());
    itemRepoMocks.findByClientNameHsn.mockResolvedValue(makeItemRow());
    await expect(
      createAgencyClientItemService("org-1", "mem-1", "cli-1", createInput),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(itemRepoMocks.insertAgencyClientItem).not.toHaveBeenCalled();
  });

  it("inserts with org+client scoping and creator attribution", async () => {
    clientRepoMocks.findAgencyClientById.mockResolvedValue(makeClient());
    itemRepoMocks.findByClientNameHsn.mockResolvedValue(null);
    itemRepoMocks.insertAgencyClientItem.mockResolvedValue(makeItemRow());

    const dto = await createAgencyClientItemService(
      "org-1",
      "mem-1",
      "cli-1",
      createInput,
    );

    expect(dto.organizationId).toBe("org-1");
    expect(dto.clientId).toBe("cli-1");
    expect(dto.defaultRate).toBe(1500);
    expect(itemRepoMocks.insertAgencyClientItem).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: "org-1",
        clientId: "cli-1",
        createdByOrgUserId: "mem-1",
        itemName: "Design services",
        hsnCode: "998314",
        defaultRate: 1500,
        defaultTaxPercent: 18,
      }),
    );
  });
});

describe("agencyClientItem.service - list / get", () => {
  beforeEach(() => vi.clearAllMocks());

  it("list rejects when the client is not in the org", async () => {
    clientRepoMocks.findAgencyClientById.mockResolvedValue(null);
    await expect(
      listAgencyClientItemsService("org-1", "cli-1"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("list delegates to the repository scoped to the client", async () => {
    clientRepoMocks.findAgencyClientById.mockResolvedValue(makeClient());
    itemRepoMocks.listAgencyClientItemsByClient.mockResolvedValue([
      makeItemRow(),
      makeItemRow({ id: "item-2", item_name: "Copywriting" }),
    ]);

    const items = await listAgencyClientItemsService("org-1", "cli-1", "des");

    expect(items).toHaveLength(2);
    expect(itemRepoMocks.listAgencyClientItemsByClient).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "cli-1",
      "des",
    );
  });

  it("get returns 404 when item id not found for this (org, client)", async () => {
    clientRepoMocks.findAgencyClientById.mockResolvedValue(makeClient());
    itemRepoMocks.findAgencyClientItemById.mockResolvedValue(null);
    await expect(
      getAgencyClientItemService("org-1", "cli-1", "item-xyz"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("agencyClientItem.service - update / delete", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects update when the renamed (name, hsn) collides with another item", async () => {
    clientRepoMocks.findAgencyClientById.mockResolvedValue(makeClient());
    itemRepoMocks.findAgencyClientItemById.mockResolvedValue(makeItemRow());
    itemRepoMocks.findByClientNameHsn.mockResolvedValue(
      makeItemRow({ id: "item-2", item_name: "Copywriting", hsn_code: "998315" }),
    );

    await expect(
      updateAgencyClientItemService("org-1", "cli-1", "item-1", {
        itemName: "Copywriting",
        hsnCode: "998315",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(itemRepoMocks.updateAgencyClientItem).not.toHaveBeenCalled();
  });

  it("updates defaults when no identifier changes", async () => {
    clientRepoMocks.findAgencyClientById.mockResolvedValue(makeClient());
    itemRepoMocks.findAgencyClientItemById.mockResolvedValue(makeItemRow());
    itemRepoMocks.updateAgencyClientItem.mockResolvedValue(
      makeItemRow({ default_rate: "1800.00" }),
    );

    const dto = await updateAgencyClientItemService(
      "org-1",
      "cli-1",
      "item-1",
      { defaultRate: 1800 },
    );

    expect(dto.defaultRate).toBe(1800);
    expect(itemRepoMocks.updateAgencyClientItem).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "cli-1",
      "item-1",
      expect.objectContaining({ default_rate: 1800 }),
    );
  });

  it("soft delete requires the item exists in the (org, client) scope", async () => {
    clientRepoMocks.findAgencyClientById.mockResolvedValue(makeClient());
    itemRepoMocks.findAgencyClientItemById.mockResolvedValue(null);
    await expect(
      softDeleteAgencyClientItemService("org-1", "cli-1", "item-x"),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(itemRepoMocks.softDeleteAgencyClientItem).not.toHaveBeenCalled();
  });
});

describe("agencyClientItem.service - upsert from row", () => {
  beforeEach(() => vi.clearAllMocks());

  const row = {
    itemName: "Design services",
    description: undefined,
    hsnCode: "998314",
    rate: 1800,
    taxPercent: 18,
    discountPercent: 0,
    unit: "hour",
  };

  it("updates the existing item defaults (no duplicate insert)", async () => {
    clientRepoMocks.findAgencyClientById.mockResolvedValue(makeClient());
    itemRepoMocks.findByClientNameHsn.mockResolvedValue(makeItemRow());
    itemRepoMocks.updateAgencyClientItem.mockResolvedValue(
      makeItemRow({ default_rate: "1800.00" }),
    );

    const dto = await upsertClientItemFromRowService(
      "org-1",
      "mem-1",
      "cli-1",
      row,
    );

    expect(dto.defaultRate).toBe(1800);
    expect(itemRepoMocks.insertAgencyClientItem).not.toHaveBeenCalled();
    expect(itemRepoMocks.updateAgencyClientItem).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "cli-1",
      "item-1",
      expect.objectContaining({
        default_rate: 1800,
        default_tax_percent: 18,
        default_discount_percent: 0,
      }),
    );
  });

  it("inserts a new catalog entry when no match exists", async () => {
    clientRepoMocks.findAgencyClientById.mockResolvedValue(makeClient());
    itemRepoMocks.findByClientNameHsn.mockResolvedValue(null);
    itemRepoMocks.insertAgencyClientItem.mockResolvedValue(makeItemRow());

    const dto = await upsertClientItemFromRowService(
      "org-1",
      "mem-1",
      "cli-1",
      row,
    );

    expect(dto.clientId).toBe("cli-1");
    expect(itemRepoMocks.insertAgencyClientItem).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: "org-1",
        clientId: "cli-1",
        createdByOrgUserId: "mem-1",
        itemName: "Design services",
        hsnCode: "998314",
      }),
    );
  });

  it("rejects when the client is not in the org", async () => {
    clientRepoMocks.findAgencyClientById.mockResolvedValue(null);
    await expect(
      upsertClientItemFromRowService("org-1", "mem-1", "cli-1", row),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
