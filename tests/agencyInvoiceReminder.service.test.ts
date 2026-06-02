import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

const invoiceRepoMocks = vi.hoisted(() => ({
  findAgencyInvoiceById: vi.fn(),
}));
const reminderRepoMocks = vi.hoisted(() => ({
  cancelReminder: vi.fn(),
  findReminderById: vi.fn(),
  insertReminders: vi.fn(),
  listRemindersByInvoice: vi.fn(),
}));

vi.mock("../src/repositories/agencyInvoice.repository.js", () => invoiceRepoMocks);
vi.mock("../src/repositories/agencyReminder.repository.js", () => reminderRepoMocks);

import {
  cancelInvoiceReminderService,
  createInvoiceReminderService,
  listInvoiceRemindersService,
} from "../src/services/agencyInvoiceReminder.service.js";
import { seedRemindersFromOffsets } from "../src/lib/invoiceReminderSchedule.js";

describe("agencyInvoiceReminder.service - reminder seed", () => {
  it("produces entries only for selected offsets", () => {
    const seed = seedRemindersFromOffsets("2026-02-15", [-3, 0, 7]);
    expect(seed.map((r) => r.type)).toEqual(["before_due", "on_due", "overdue"]);
    expect(seed.every((r) => r.channel === "email")).toBe(true);
    expect(seed.map((r) => r.offsetDays)).toEqual([-3, 0, 7]);
    expect(seed[0].scheduledFor.getTime()).toBeLessThan(seed[1].scheduledFor.getTime());
    expect(seed[1].scheduledFor.getTime()).toBeLessThan(seed[2].scheduledFor.getTime());
  });
});

describe("agencyInvoiceReminder.service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists reminders only after confirming invoice belongs to the org", async () => {
    invoiceRepoMocks.findAgencyInvoiceById.mockResolvedValue({ id: "inv-1" });
    reminderRepoMocks.listRemindersByInvoice.mockResolvedValue([]);
    await listInvoiceRemindersService("org-1", "inv-1");
    expect(invoiceRepoMocks.findAgencyInvoiceById).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "inv-1",
    );
    expect(reminderRepoMocks.listRemindersByInvoice).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      "inv-1",
    );
  });

  it("returns 404 when invoice is not in the organization", async () => {
    invoiceRepoMocks.findAgencyInvoiceById.mockResolvedValue(null);
    await expect(listInvoiceRemindersService("org-2", "inv-1")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("rejects reminders with invalid scheduledFor values", async () => {
    invoiceRepoMocks.findAgencyInvoiceById.mockResolvedValue({ id: "inv-1" });
    await expect(
      createInvoiceReminderService("org-1", "inv-1", {
        type: "custom",
        scheduledFor: "not-a-date",
        channel: "email",
        offsetDays: 0,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("cancel rejects reminder that belongs to a different invoice", async () => {
    reminderRepoMocks.findReminderById.mockResolvedValue({
      id: "rem-1",
      invoice_id: "inv-DIFFERENT",
      organization_id: "org-1",
    });
    await expect(
      cancelInvoiceReminderService("org-1", "inv-1", "rem-1"),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(reminderRepoMocks.cancelReminder).not.toHaveBeenCalled();
  });

  it("cancel returns 404 when reminder is not in the org", async () => {
    reminderRepoMocks.findReminderById.mockResolvedValue(null);
    await expect(
      cancelInvoiceReminderService("org-1", "inv-1", "rem-missing"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
