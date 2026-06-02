import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

const invoiceRepoMocks = vi.hoisted(() => ({
  findAgencyInvoiceById: vi.fn(),
  updateAgencyInvoice: vi.fn(),
}));
const paymentRepoMocks = vi.hoisted(() => ({
  insertPayment: vi.fn(),
  listPaymentsByInvoice: vi.fn(),
  sumPaymentsByInstallment: vi.fn(),
  sumPaymentDeductionsByInvoice: vi.fn(),
}));
const installmentRepoMocks = vi.hoisted(() => ({
  findInstallmentById: vi.fn(),
  updateInstallmentStatus: vi.fn(),
}));
const notificationRepoMocks = vi.hoisted(() => ({
  insertNotification: vi.fn(),
}));

vi.mock("../src/repositories/agencyInvoice.repository.js", () => invoiceRepoMocks);
vi.mock("../src/repositories/agencyPayment.repository.js", () => paymentRepoMocks);
vi.mock("../src/repositories/agencyInstallment.repository.js", () => installmentRepoMocks);
vi.mock("../src/repositories/agencyNotification.repository.js", () => notificationRepoMocks);

import { pool } from "../src/db/pool.js";
import { recordInvoicePaymentService } from "../src/services/agencyInvoicePayment.service.js";

const now = new Date("2026-01-15T10:00:00.000Z");

function makeInvoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    organization_id: "org-1",
    client_id: "cli-1",
    project_id: null,
    invoice_number: "INV-2026-00001",
    issue_date: new Date("2026-01-15"),
    due_date: new Date("2026-12-15"),
    currency: "INR",
    status: "sent",
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

function makePaymentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay-1",
    invoice_id: "inv-1",
    organization_id: "org-1",
    installment_id: null,
    amount: "500",
    payment_gateway_fee: "0",
    tds_deducted: "0",
    other_deduction: "0",
    settlement_reference_amount: "1180",
    method: "upi",
    reference: null,
    received_at: now,
    notes: null,
    recorded_by_org_user_id: "mem-1",
    created_at: now,
    ...overrides,
  };
}

function wirePoolClient() {
  const poolClient = {
    query: vi.fn(async () => ({ rows: [] })),
    release: vi.fn(),
  };
  (pool.connect as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(poolClient);
  return poolClient;
}

describe("agencyInvoicePayment.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paymentRepoMocks.sumPaymentDeductionsByInvoice.mockResolvedValue(0);
  });

  it("transitions invoice to partial when payment < grand total", async () => {
    const poolClient = wirePoolClient();
    invoiceRepoMocks.findAgencyInvoiceById.mockResolvedValue(makeInvoiceRow());
    paymentRepoMocks.insertPayment.mockResolvedValue(makePaymentRow({ amount: "500" }));

    await recordInvoicePaymentService("org-1", "mem-1", "inv-1", {
      amount: 500,
      method: "upi",
    });

    expect(poolClient.query).toHaveBeenCalledWith("BEGIN");
    expect(poolClient.query).toHaveBeenCalledWith("COMMIT");
    expect(invoiceRepoMocks.updateAgencyInvoice).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "inv-1",
      expect.objectContaining({
        amount_received: 500,
        amount_pending: 680,
        status: "partial",
      }),
    );
  });

  it("transitions invoice to paid when full grand total is received", async () => {
    wirePoolClient();
    invoiceRepoMocks.findAgencyInvoiceById.mockResolvedValue(makeInvoiceRow());
    paymentRepoMocks.insertPayment.mockResolvedValue(makePaymentRow({ amount: "1180" }));

    await recordInvoicePaymentService("org-1", "mem-1", "inv-1", {
      amount: 1180,
      method: "bank_transfer",
    });

    expect(invoiceRepoMocks.updateAgencyInvoice).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "inv-1",
      expect.objectContaining({
        amount_received: 1180,
        amount_pending: 0,
        status: "paid",
      }),
    );
  });

  it("rejects payments that exceed the pending balance", async () => {
    wirePoolClient();
    invoiceRepoMocks.findAgencyInvoiceById.mockResolvedValue(
      makeInvoiceRow({ amount_received: "900", amount_pending: "280" }),
    );

    await expect(
      recordInvoicePaymentService("org-1", "mem-1", "inv-1", {
        amount: 500,
        method: "cash",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(invoiceRepoMocks.updateAgencyInvoice).not.toHaveBeenCalled();
  });

  it("rejects payments on a cancelled invoice", async () => {
    wirePoolClient();
    invoiceRepoMocks.findAgencyInvoiceById.mockResolvedValue(
      makeInvoiceRow({ status: "cancelled" }),
    );

    await expect(
      recordInvoicePaymentService("org-1", "mem-1", "inv-1", {
        amount: 100,
        method: "cash",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("returns 404 if invoice not found in organization", async () => {
    wirePoolClient();
    invoiceRepoMocks.findAgencyInvoiceById.mockResolvedValue(null);
    await expect(
      recordInvoicePaymentService("org-2", "mem-1", "inv-1", {
        amount: 100,
        method: "cash",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects installment payments for a different invoice", async () => {
    wirePoolClient();
    invoiceRepoMocks.findAgencyInvoiceById.mockResolvedValue(makeInvoiceRow());
    installmentRepoMocks.findInstallmentById.mockResolvedValue({
      id: "inst-1",
      invoice_id: "inv-OTHER",
      organization_id: "org-1",
      amount: "500",
    });

    await expect(
      recordInvoicePaymentService("org-1", "mem-1", "inv-1", {
        amount: 500,
        method: "upi",
        installmentId: "inst-1",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("marks installment as paid when a matching installment payment fully covers it", async () => {
    wirePoolClient();
    invoiceRepoMocks.findAgencyInvoiceById.mockResolvedValue(makeInvoiceRow());
    installmentRepoMocks.findInstallmentById.mockResolvedValue({
      id: "inst-1",
      invoice_id: "inv-1",
      organization_id: "org-1",
      amount: "500",
      status: "pending",
    });
    paymentRepoMocks.insertPayment.mockResolvedValue(
      makePaymentRow({ amount: "500", installment_id: "inst-1" }),
    );
    paymentRepoMocks.sumPaymentsByInstallment.mockResolvedValue(500);

    await recordInvoicePaymentService("org-1", "mem-1", "inv-1", {
      amount: 500,
      method: "upi",
      installmentId: "inst-1",
    });

    expect(installmentRepoMocks.updateInstallmentStatus).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "inst-1",
      "paid",
      expect.any(Date),
    );
  });

  it("passes settlement snapshot and deductions to insertPayment", async () => {
    wirePoolClient();
    invoiceRepoMocks.findAgencyInvoiceById.mockResolvedValue(makeInvoiceRow());
    paymentRepoMocks.insertPayment.mockResolvedValue(makePaymentRow());
    paymentRepoMocks.sumPaymentDeductionsByInvoice
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(100);

    await recordInvoicePaymentService("org-1", "mem-1", "inv-1", {
      amount: 1000,
      method: "bank_transfer",
      paymentGatewayFee: 50,
      tdsDeducted: 30,
      otherDeduction: 20,
    });

    expect(paymentRepoMocks.insertPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        amount: 1000,
        paymentGatewayFee: 50,
        tdsDeducted: 30,
        otherDeduction: 20,
        settlementReferenceAmount: 1180,
      }),
    );
    expect(invoiceRepoMocks.updateAgencyInvoice).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "inv-1",
      expect.objectContaining({
        amount_received: 1000,
        amount_pending: 80,
        status: "partial",
      }),
    );
  });

  it("marks paid when net plus recorded deductions equals grand total", async () => {
    wirePoolClient();
    invoiceRepoMocks.findAgencyInvoiceById.mockResolvedValue(makeInvoiceRow());
    paymentRepoMocks.insertPayment.mockResolvedValue(makePaymentRow({ amount: "1000" }));
    paymentRepoMocks.sumPaymentDeductionsByInvoice
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(180);

    await recordInvoicePaymentService("org-1", "mem-1", "inv-1", {
      amount: 1000,
      method: "bank_transfer",
      paymentGatewayFee: 100,
      tdsDeducted: 50,
      otherDeduction: 30,
    });

    expect(invoiceRepoMocks.updateAgencyInvoice).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "inv-1",
      expect.objectContaining({
        amount_received: 1000,
        amount_pending: 0,
        status: "paid",
      }),
    );
  });
});
