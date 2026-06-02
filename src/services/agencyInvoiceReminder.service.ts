import { pool } from "../db/pool.js";
import { findAgencyInvoiceById } from "../repositories/agencyInvoice.repository.js";
import {
  cancelReminder,
  findReminderById,
  insertReminders,
  listRemindersByInvoice,
} from "../repositories/agencyReminder.repository.js";
import {
  toAgencyReminderDto,
  type AgencyReminderDto,
} from "../types/agencyInvoice.js";
import { HttpError } from "../utils/httpError.js";
import type { CreateReminderInput } from "../validators/agencyInvoice.schema.js";

export async function listInvoiceRemindersService(
  organizationId: string,
  invoiceId: string,
): Promise<AgencyReminderDto[]> {
  const invoice = await findAgencyInvoiceById(pool, organizationId, invoiceId);
  if (!invoice) throw new HttpError(404, "Invoice not found.");
  const rows = await listRemindersByInvoice(pool, organizationId, invoiceId);
  return rows.map(toAgencyReminderDto);
}

export async function createInvoiceReminderService(
  organizationId: string,
  invoiceId: string,
  input: CreateReminderInput,
): Promise<AgencyReminderDto> {
  const invoice = await findAgencyInvoiceById(pool, organizationId, invoiceId);
  if (!invoice) throw new HttpError(404, "Invoice not found.");

  const scheduledFor = new Date(input.scheduledFor);
  if (Number.isNaN(scheduledFor.getTime())) {
    throw new HttpError(400, "Invalid scheduledFor date.");
  }

  const [row] = await insertReminders(pool, [
    {
      invoiceId,
      organizationId,
      type: input.type,
      offsetDays: input.offsetDays,
      scheduledFor,
      channel: input.channel,
    },
  ]);

  return toAgencyReminderDto(row);
}

export async function cancelInvoiceReminderService(
  organizationId: string,
  invoiceId: string,
  reminderId: string,
): Promise<void> {
  const reminder = await findReminderById(pool, organizationId, reminderId);
  if (!reminder) throw new HttpError(404, "Reminder not found.");
  if (reminder.invoice_id !== invoiceId) {
    throw new HttpError(400, "Reminder does not belong to this invoice.");
  }
  const ok = await cancelReminder(pool, organizationId, reminderId);
  if (!ok) throw new HttpError(409, "Reminder is not cancellable.");
}
