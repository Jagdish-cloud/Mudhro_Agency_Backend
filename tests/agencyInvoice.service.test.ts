import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

const invoiceRepoMocks = vi.hoisted(() => ({
  findAgencyInvoiceById: vi.fn(),
  findInvoiceItemsByInvoice: vi.fn(),
  insertAgencyInvoice: vi.fn(),
  insertInvoiceItems: vi.fn(),
  listAgencyInvoices: vi.fn(),
  rotatePortalToken: vi.fn(),
  softDeleteAgencyInvoice: vi.fn(),
  updateAgencyInvoice: vi.fn(),
  deleteInvoiceItems: vi.fn(),
}));
const clientRepoMocks = vi.hoisted(() => ({
  findAgencyClientById: vi.fn(),
}));
const sequenceRepoMocks = vi.hoisted(() => ({
  allocateInvoiceSequence: vi.fn(),
}));
const installmentRepoMocks = vi.hoisted(() => ({
  deleteInstallmentsByInvoice: vi.fn(),
  insertInstallments: vi.fn(),
  listInstallmentsByInvoice: vi.fn(),
}));
const reminderRepoMocks = vi.hoisted(() => ({
  insertReminders: vi.fn(),
  listRemindersByInvoice: vi.fn(),
}));

vi.mock("../src/repositories/agencyInvoice.repository.js", () => invoiceRepoMocks);
vi.mock("../src/repositories/agencyClient.repository.js", () => clientRepoMocks);
vi.mock("../src/repositories/agencyInvoiceSequence.repository.js", () => sequenceRepoMocks);
vi.mock("../src/repositories/agencyInstallment.repository.js", () => installmentRepoMocks);
vi.mock("../src/repositories/agencyReminder.repository.js", () => reminderRepoMocks);

import { pool } from "../src/db/pool.js";
import {
  computeInvoiceLines,
  createAgencyInvoiceService,
  formatInvoiceNumber,
  getAgencyInvoiceService,
  updateAgencyInvoiceService,
} from "../src/services/agencyInvoice.service.js";
import type { AuthPayload } from "../src/types/auth.js";

const now = new Date("2026-01-15T10:00:00.000Z");

function makeInvoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    organization_id: "org-1",
    client_id: "cli-1",
    project_id: null,
    invoice_number: "INV-2026-00001",
    issue_date: new Date("2026-01-15"),
    due_date: new Date("2026-02-15"),
    currency: "INR",
    status: "draft",
    payment_terms: null,
    notes: null,
    place_of_supply: "27",
    subtotal: "1000",
    discount_total: "0",
    cgst_total: "90",
    sgst_total: "90",
    igst_total: "0",
    tax_total: "180",
    grand_total: "1180",
    amount_received: "0",
    amount_pending: "1180",
    amounts_inclusive_of_tax: false,
    reminders_enabled: true,
    portal_token: "tok",
    sent_at: null,
    viewed_at: null,
    created_by_org_user_id: "mem-1",
    created_by_name: "Creator",
    created_by_email: "creator@mudhro.test",
    created_at: now,
    updated_at: now,
    deleted_at: null,
    ...overrides,
  };
}

describe("agencyInvoice - pure tax computation", () => {
  it("splits tax into CGST+SGST when seller and buyer states match", () => {
    const { totals, lines } = computeInvoiceLines(
      [
        { itemName: "Design", hsnCode: "9983", qty: 1, rate: 1000, discountPercent: 0, taxPercent: 18 },
      ],
      "27",
      "27",
    );
    expect(totals.cgstTotal).toBe(90);
    expect(totals.sgstTotal).toBe(90);
    expect(totals.igstTotal).toBe(0);
    expect(totals.taxTotal).toBe(180);
    expect(totals.grandTotal).toBe(1180);
    expect(lines[0].cgstAmount).toBe(90);
    expect(lines[0].sgstAmount).toBe(90);
  });

  it("applies IGST when seller and buyer states differ", () => {
    const { totals } = computeInvoiceLines(
      [
        { itemName: "Design", hsnCode: "9983", qty: 1, rate: 1000, discountPercent: 0, taxPercent: 18 },
      ],
      "27",
      "29",
    );
    expect(totals.cgstTotal).toBe(0);
    expect(totals.sgstTotal).toBe(0);
    expect(totals.igstTotal).toBe(180);
  });

  it("applies IGST when either state code is unknown", () => {
    const { totals } = computeInvoiceLines(
      [
        { itemName: "Design", hsnCode: "9983", qty: 1, rate: 1000, discountPercent: 0, taxPercent: 18 },
      ],
      "27",
      null,
    );
    expect(totals.igstTotal).toBe(180);
  });

  it("respects per-line discounts", () => {
    const { totals } = computeInvoiceLines(
      [
        { itemName: "Dev", hsnCode: "9983", qty: 2, rate: 1000, discountPercent: 10, taxPercent: 18 },
      ],
      "27",
      "27",
    );
    // subtotal = 2000, discount = 200, net = 1800, tax = 324, grand = 2124
    expect(totals.subtotal).toBe(2000);
    expect(totals.discountTotal).toBe(200);
    expect(totals.taxTotal).toBe(324);
    expect(totals.grandTotal).toBe(2124);
  });

  it("back-calculates the net rate when amountsInclusiveOfTax is true", () => {
    // Entered rate of 1180 with 18% tax means net rate = 1000.
    // Resulting tax should still be 180, total 1180 (matches the gross input).
    const { totals, lines } = computeInvoiceLines(
      [
        { itemName: "Design", hsnCode: "9983", qty: 1, rate: 1180, discountPercent: 0, taxPercent: 18 },
      ],
      "27",
      "27",
      true,
    );
    expect(totals.subtotal).toBe(1000);
    expect(totals.taxTotal).toBe(180);
    expect(totals.cgstTotal).toBe(90);
    expect(totals.sgstTotal).toBe(90);
    expect(totals.grandTotal).toBe(1180);
    // Persisted line rate is the back-calculated net so PDFs/UI stay consistent.
    expect(lines[0].rate).toBe(1000);
    expect(lines[0].lineSubtotal).toBe(1000);
    expect(lines[0].lineTotal).toBe(1180);
  });

  it("treats amountsInclusiveOfTax as a no-op when taxPercent is zero", () => {
    const { totals, lines } = computeInvoiceLines(
      [
        { itemName: "Reimburse", hsnCode: "9983", qty: 1, rate: 500, discountPercent: 0, taxPercent: 0 },
      ],
      "27",
      "27",
      true,
    );
    expect(totals.subtotal).toBe(500);
    expect(totals.taxTotal).toBe(0);
    expect(totals.grandTotal).toBe(500);
    expect(lines[0].rate).toBe(500);
  });
});

describe("agencyInvoice - number formatting", () => {
  it("pads sequence to 5 digits with INV prefix", () => {
    expect(formatInvoiceNumber(2026, 7)).toBe("INV-2026-00007");
  });
});

describe("agencyInvoice.service - create (transactional)", () => {
  beforeEach(() => vi.clearAllMocks());

  function wireConnectTransaction(overrides?: {
    org?: { state_code: string | null };
    client?: { id: string; organization_id: string; state_code: string | null } | null;
    creator?: { id: string; name: string; email: string } | null;
  }) {
    const org = { state_code: "27", ...overrides?.org } as { state_code: string | null };
    const creator =
      overrides?.creator === undefined
        ? { id: "mem-1", name: "Creator", email: "creator@mudhro.test" }
        : overrides.creator;

    const poolClient = {
      query: vi.fn(async (sql: string) => {
        const text = typeof sql === "string" ? sql : String(sql);
        if (/FROM organizations/i.test(text)) {
          return { rows: [{ id: "org-1", ...org }] };
        }
        if (/FROM organization_admins/i.test(text)) {
          return { rows: creator ? [creator] : [] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    (pool.connect as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(poolClient);
    return poolClient;
  }

  it("allocates invoice number, sets created_by, and computes CGST+SGST for intra-state clients", async () => {
    const poolClient = wireConnectTransaction();
    clientRepoMocks.findAgencyClientById.mockResolvedValue({
      id: "cli-1",
      organization_id: "org-1",
      state_code: "27",
    });
    sequenceRepoMocks.allocateInvoiceSequence.mockResolvedValue(7);
    invoiceRepoMocks.insertAgencyInvoice.mockResolvedValue(
      makeInvoiceRow({ invoice_number: "INV-2026-00007" }),
    );
    invoiceRepoMocks.insertInvoiceItems.mockResolvedValue([]);
    reminderRepoMocks.insertReminders.mockResolvedValue([]);

    const actor: AuthPayload = {
      id: "mem-1",
      organizationId: "org-1",
      email: "creator@mudhro.test",
      role: 1,
    };
    const dto = await createAgencyInvoiceService("org-1", actor, {
      clientId: "cli-1",
      issueDate: "2026-01-15",
      dueDate: "2026-02-15",
      currency: "INR",
      status: "draft",
      items: [
        { itemName: "Design", hsnCode: "9983", qty: 1, rate: 1000, discountPercent: 0, taxPercent: 18 },
      ],
      discountTotal: 0,
    });

    expect(poolClient.query).toHaveBeenCalledWith("BEGIN");
    expect(poolClient.query).toHaveBeenCalledWith("COMMIT");
    expect(sequenceRepoMocks.allocateInvoiceSequence).toHaveBeenCalledWith(
      poolClient,
      "org-1",
      2026,
    );
    expect(invoiceRepoMocks.insertAgencyInvoice).toHaveBeenCalledWith(
      poolClient,
      expect.objectContaining({
        invoiceNumber: "INV-2026-00007",
        organizationId: "org-1",
        createdByOrgUserId: "mem-1",
        createdByName: "Creator",
        cgstTotal: 90,
        sgstTotal: 90,
        igstTotal: 0,
      }),
    );
    expect(dto.invoiceNumber).toBe("INV-2026-00007");
  });

  it("rejects invoice creation if the client belongs to a different organization", async () => {
    wireConnectTransaction();
    clientRepoMocks.findAgencyClientById.mockResolvedValue(null);

    const actor: AuthPayload = {
      id: "mem-1",
      organizationId: "org-1",
      email: "creator@mudhro.test",
      role: 1,
    };
    await expect(
      createAgencyInvoiceService("org-1", actor, {
        clientId: "cli-from-other-org",
        issueDate: "2026-01-15",
        dueDate: "2026-02-15",
        currency: "INR",
        status: "draft",
        items: [
          { itemName: "X", hsnCode: "9983", qty: 1, rate: 100, discountPercent: 0, taxPercent: 0 },
        ],
        discountTotal: 0,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("persists amountsInclusiveOfTax + remindersEnabled into insertAgencyInvoice", async () => {
    wireConnectTransaction();
    clientRepoMocks.findAgencyClientById.mockResolvedValue({
      id: "cli-1",
      organization_id: "org-1",
      state_code: "27",
    });
    sequenceRepoMocks.allocateInvoiceSequence.mockResolvedValue(8);
    invoiceRepoMocks.insertAgencyInvoice.mockResolvedValue(
      makeInvoiceRow({
        invoice_number: "INV-2026-00008",
        amounts_inclusive_of_tax: true,
        reminders_enabled: false,
      }),
    );
    invoiceRepoMocks.insertInvoiceItems.mockResolvedValue([]);
    reminderRepoMocks.insertReminders.mockResolvedValue([]);

    const actor: AuthPayload = {
      id: "mem-1",
      organizationId: "org-1",
      email: "creator@mudhro.test",
      role: 1,
    };
    const dto = await createAgencyInvoiceService("org-1", actor, {
      clientId: "cli-1",
      issueDate: "2026-01-15",
      dueDate: "2026-02-15",
      currency: "INR",
      status: "draft",
      items: [
        { itemName: "Design", hsnCode: "9983", qty: 1, rate: 1180, discountPercent: 0, taxPercent: 18 },
      ],
      discountTotal: 0,
      amountsInclusiveOfTax: true,
      remindersEnabled: false,
    });

    expect(invoiceRepoMocks.insertAgencyInvoice).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        amountsInclusiveOfTax: true,
        remindersEnabled: false,
        // Inclusive 1180 with 18% GST yields net 1000, tax 180, grand 1180.
        subtotal: 1000,
        taxTotal: 180,
        grandTotal: 1180,
      }),
    );
    expect(dto.amountsInclusiveOfTax).toBe(true);
    expect(dto.remindersEnabled).toBe(false);
  });

  it("rejects installments that do not sum to the grand total", async () => {
    wireConnectTransaction();
    clientRepoMocks.findAgencyClientById.mockResolvedValue({
      id: "cli-1",
      organization_id: "org-1",
      state_code: "27",
    });
    sequenceRepoMocks.allocateInvoiceSequence.mockResolvedValue(1);

    const actor: AuthPayload = {
      id: "mem-1",
      organizationId: "org-1",
      email: "creator@mudhro.test",
      role: 1,
    };
    await expect(
      createAgencyInvoiceService("org-1", actor, {
        clientId: "cli-1",
        issueDate: "2026-01-15",
        dueDate: "2026-02-15",
        currency: "INR",
        status: "draft",
        items: [
          { itemName: "X", hsnCode: "9983", qty: 1, rate: 1000, discountPercent: 0, taxPercent: 18 },
        ],
        installments: [
          { sequence: 1, dueDate: "2026-02-15", amount: 500 },
          { sequence: 2, dueDate: "2026-03-15", amount: 500 }, // grand is 1180, sums to 1000
        ],
        discountTotal: 0,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("agencyInvoice.service - cross-org isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getAgencyInvoiceService returns 404 when invoice not in org", async () => {
    invoiceRepoMocks.findAgencyInvoiceById.mockResolvedValue(null);
    await expect(getAgencyInvoiceService("org-2", "inv-1")).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(invoiceRepoMocks.findAgencyInvoiceById).toHaveBeenCalledWith(
      expect.anything(),
      "org-2",
      "inv-1",
    );
  });
});

describe("agencyInvoice.service - update preserves created_by_*", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never includes created_by_* in the update patch", async () => {
    const poolClient = {
      query: vi.fn(async () => ({ rows: [] })),
      release: vi.fn(),
    };
    (pool.connect as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(poolClient);

    invoiceRepoMocks.findAgencyInvoiceById.mockResolvedValue(makeInvoiceRow({ status: "draft" }));
    invoiceRepoMocks.findInvoiceItemsByInvoice.mockResolvedValue([]);
    installmentRepoMocks.listInstallmentsByInvoice.mockResolvedValue([]);
    reminderRepoMocks.listRemindersByInvoice.mockResolvedValue([]);
    invoiceRepoMocks.updateAgencyInvoice.mockResolvedValue(
      makeInvoiceRow({ status: "sent" }),
    );

    const actor: AuthPayload = {
      id: "mem-1",
      organizationId: "org-1",
      email: "x@y.z",
      role: 1,
    };
    await updateAgencyInvoiceService("org-1", actor, "inv-1", {
      status: "sent",
    });

    const patch = invoiceRepoMocks.updateAgencyInvoice.mock.calls[0][3];
    expect(patch).toBeDefined();
    expect(patch).not.toHaveProperty("created_by_org_user_id");
    expect(patch).not.toHaveProperty("created_by_name");
    expect(patch).not.toHaveProperty("created_by_email");
  });

  it("blocks editing a paid invoice even for admins", async () => {
    const poolClient = {
      query: vi.fn(async () => ({ rows: [] })),
      release: vi.fn(),
    };
    (pool.connect as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(poolClient);
    invoiceRepoMocks.findAgencyInvoiceById.mockResolvedValue(
      makeInvoiceRow({ status: "paid" }),
    );

    const actor: AuthPayload = {
      id: "admin-1",
      organizationId: "org-1",
      email: "a@y.z",
      role: 1,
    };
    await expect(
      updateAgencyInvoiceService("org-1", actor, "inv-1", { notes: "nope" }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
