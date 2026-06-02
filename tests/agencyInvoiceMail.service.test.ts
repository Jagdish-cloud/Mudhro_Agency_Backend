import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn(async () => ({ rows: [{ name: "Mudhro" }] })), connect: vi.fn() },
}));

const invoiceRepoMocks = vi.hoisted(() => ({
  findAgencyInvoiceById: vi.fn(),
  findInvoiceItemsByInvoice: vi.fn(async () => []),
}));
const clientRepoMocks = vi.hoisted(() => ({
  findAgencyClientById: vi.fn(),
}));
const reminderRepoMocks = vi.hoisted(() => ({
  insertReminders: vi.fn(async () => []),
  listRemindersByInvoice: vi.fn(async () => []),
  updateReminderStatus: vi.fn(),
}));
const invoiceServiceMocks = vi.hoisted(() => ({
  seedRemindersFromOffsets: vi.fn(() => [
    { type: "before_due", offsetDays: -3, scheduledFor: new Date(), channel: "email" },
    { type: "on_due", offsetDays: 0, scheduledFor: new Date(), channel: "email" },
    { type: "overdue", offsetDays: 7, scheduledFor: new Date(), channel: "email" },
  ]),
  markInvoiceSentService: vi.fn(async () => {}),
}));
const pdfServiceMocks = vi.hoisted(() => ({
  generateInvoicePdf: vi.fn(async () => {
    throw new Error("skip pdf in tests");
  }),
}));
const mailServiceMocks = vi.hoisted(() => ({
  sendMail: vi.fn(async () => ({
    delivered: true,
    mode: "stub" as const,
    messageId: "msg-1",
  })),
}));

vi.mock("../src/repositories/agencyInvoice.repository.js", () => invoiceRepoMocks);
vi.mock("../src/repositories/agencyClient.repository.js", () => clientRepoMocks);
vi.mock("../src/repositories/agencyReminder.repository.js", () => reminderRepoMocks);
vi.mock("../src/services/agencyInvoice.service.js", () => invoiceServiceMocks);
vi.mock("../src/services/agencyInvoicePdf.service.js", () => pdfServiceMocks);
vi.mock("../src/services/mail.service.js", () => mailServiceMocks);

import { sendInvoiceEmailService } from "../src/services/agencyInvoiceMail.service.js";

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
    reminder_offsets: [-3, 0, 7],
    portal_token: "tok",
    sent_at: null,
    viewed_at: null,
    created_by_org_user_id: "mem-1",
    created_by_name: "Creator",
    created_by_email: "creator@mudhro.test",
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    ...overrides,
  };
}

describe("agencyInvoiceMail.service.sendInvoiceEmailService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("seeds reminders from invoice reminder_offsets when reminders_enabled is true", async () => {
    invoiceRepoMocks.findAgencyInvoiceById.mockResolvedValue(makeInvoiceRow());
    clientRepoMocks.findAgencyClientById.mockResolvedValue({
      id: "cli-1",
      organization_id: "org-1",
      email: "client@example.com",
      name: "Acme Inc",
    });
    reminderRepoMocks.listRemindersByInvoice.mockResolvedValue([]);

    await sendInvoiceEmailService("org-1", "inv-1");

    expect(invoiceServiceMocks.seedRemindersFromOffsets).toHaveBeenCalledWith(
      "2026-02-15",
      [-3, 0, 7],
    );
    expect(reminderRepoMocks.insertReminders).toHaveBeenCalledTimes(1);
  });

  it("skips seeding when reminders_enabled is false", async () => {
    invoiceRepoMocks.findAgencyInvoiceById.mockResolvedValue(
      makeInvoiceRow({ reminders_enabled: false }),
    );
    clientRepoMocks.findAgencyClientById.mockResolvedValue({
      id: "cli-1",
      organization_id: "org-1",
      email: "client@example.com",
      name: "Acme Inc",
    });
    reminderRepoMocks.listRemindersByInvoice.mockResolvedValue([]);

    await sendInvoiceEmailService("org-1", "inv-1");

    expect(invoiceServiceMocks.seedRemindersFromOffsets).not.toHaveBeenCalled();
    expect(reminderRepoMocks.insertReminders).not.toHaveBeenCalled();
  });

  it("skips seeding when no reminder offsets are selected", async () => {
    invoiceRepoMocks.findAgencyInvoiceById.mockResolvedValue(
      makeInvoiceRow({ reminder_offsets: [] }),
    );
    clientRepoMocks.findAgencyClientById.mockResolvedValue({
      id: "cli-1",
      organization_id: "org-1",
      email: "client@example.com",
      name: "Acme Inc",
    });
    reminderRepoMocks.listRemindersByInvoice.mockResolvedValue([]);

    await sendInvoiceEmailService("org-1", "inv-1");

    expect(invoiceServiceMocks.seedRemindersFromOffsets).not.toHaveBeenCalled();
    expect(reminderRepoMocks.insertReminders).not.toHaveBeenCalled();
  });

  it("does not re-seed reminders when scheduled reminders already exist", async () => {
    invoiceRepoMocks.findAgencyInvoiceById.mockResolvedValue(makeInvoiceRow());
    clientRepoMocks.findAgencyClientById.mockResolvedValue({
      id: "cli-1",
      organization_id: "org-1",
      email: "client@example.com",
      name: "Acme Inc",
    });
    reminderRepoMocks.listRemindersByInvoice.mockResolvedValue([
      { id: "r-1", status: "scheduled" },
    ]);

    await sendInvoiceEmailService("org-1", "inv-1");

    expect(reminderRepoMocks.insertReminders).not.toHaveBeenCalled();
  });
});
