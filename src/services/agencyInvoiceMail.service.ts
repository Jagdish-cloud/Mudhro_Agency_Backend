import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import { findAgencyClientById } from "../repositories/agencyClient.repository.js";
import {
  findAgencyInvoiceById,
  findInvoiceItemsByInvoice,
} from "../repositories/agencyInvoice.repository.js";
import {
  insertReminders,
  listRemindersByInvoice,
  updateReminderStatus,
} from "../repositories/agencyReminder.repository.js";
import type { AgencyInvoiceRow } from "../types/agencyInvoice.js";
import { HttpError } from "../utils/httpError.js";
import { seedRemindersFromOffsets, markInvoiceSentService } from "./agencyInvoice.service.js";
import { generateInvoicePdf } from "./agencyInvoicePdf.service.js";
import { sendMail } from "./mail.service.js";

function amount(n: string | number, currency: string): string {
  const num = typeof n === "string" ? Number(n) : n;
  return `${currency} ${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildPortalLink(invoice: AgencyInvoiceRow): string {
  return `${env.APP_PUBLIC_URL.replace(/\/$/, "")}/portal/invoices/${invoice.portal_token}`;
}

function buildHtmlBody(args: {
  invoice: AgencyInvoiceRow;
  orgName: string;
  clientName: string;
  portalLink: string;
  customMessage?: string;
  itemsHtml: string;
}): string {
  const { invoice, orgName, clientName, portalLink, customMessage, itemsHtml } = args;
  return `
  <div style="font-family: Arial, sans-serif; color:#111; max-width: 640px; margin: 0 auto;">
    <h2 style="color:#0f172a; margin: 0 0 12px;">Invoice ${invoice.invoice_number} from ${orgName}</h2>
    <p>Hi ${clientName || "there"},</p>
    ${customMessage ? `<p>${customMessage}</p>` : ""}
    <p>Please find your invoice details below.</p>
    <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td><strong>Invoice #</strong></td><td>${invoice.invoice_number}</td></tr>
      <tr><td><strong>Issue Date</strong></td><td>${invoice.issue_date.toISOString().slice(0, 10)}</td></tr>
      <tr><td><strong>Due Date</strong></td><td>${invoice.due_date.toISOString().slice(0, 10)}</td></tr>
      <tr><td><strong>Status</strong></td><td>${invoice.status}</td></tr>
      <tr><td><strong>Amount Due</strong></td><td>${amount(invoice.amount_pending, invoice.currency)}</td></tr>
    </table>
    <h3 style="margin: 16px 0 6px;">Line Items</h3>
    <table style="width:100%; border-collapse: collapse; font-size: 13px;">
      <thead>
        <tr style="background:#f1f5f9; text-align:left;">
          <th style="padding:6px;">#</th>
          <th style="padding:6px;">Item</th>
          <th style="padding:6px;">HSN</th>
          <th style="padding:6px; text-align:right;">Qty</th>
          <th style="padding:6px; text-align:right;">Rate</th>
          <th style="padding:6px; text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <p style="margin: 20px 0;">
      <a href="${portalLink}" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">
        View Invoice Online
      </a>
    </p>
    <p style="font-size:12px; color:#64748b;">
      A PDF copy is attached for your records. If you have any questions, just reply to this email.
    </p>
    <p style="font-size:12px; color:#64748b;">— ${orgName}</p>
  </div>`;
}

export type SendInvoiceOptions = {
  emailOverride?: string;
  cc?: string[];
  message?: string;
};

export type SendInvoiceResult = {
  delivered: boolean;
  mode: "smtp" | "stub";
  messageId: string;
  error?: string;
  portalLink: string;
};

export async function sendInvoiceEmailService(
  organizationId: string,
  invoiceId: string,
  options: SendInvoiceOptions = {},
): Promise<SendInvoiceResult> {
  const invoice = await findAgencyInvoiceById(pool, organizationId, invoiceId);
  if (!invoice) throw new HttpError(404, "Invoice not found.");
  if (invoice.status === "cancelled") {
    throw new HttpError(409, "Cannot send a cancelled invoice.");
  }

  const client = await findAgencyClientById(pool, organizationId, invoice.client_id);
  if (!client) throw new HttpError(404, "Client not found.");

  const to = options.emailOverride || client.email;
  if (!to) throw new HttpError(400, "Client has no email on file; provide emailOverride.");

  const orgResult = await pool.query<{ name: string }>(
    "SELECT name FROM organizations WHERE id = $1 LIMIT 1;",
    [organizationId],
  );
  const orgName = orgResult.rows[0]?.name ?? "Mudhro";

  const items = await findInvoiceItemsByInvoice(pool, organizationId, invoiceId);
  const itemsHtml = items
    .sort((a, b) => a.position - b.position)
    .map(
      (it) => `
        <tr>
          <td style="padding:6px; border-top:1px solid #e2e8f0;">${it.position}</td>
          <td style="padding:6px; border-top:1px solid #e2e8f0;">${it.item_name}</td>
          <td style="padding:6px; border-top:1px solid #e2e8f0;">${it.hsn_code}</td>
          <td style="padding:6px; border-top:1px solid #e2e8f0; text-align:right;">${it.qty}</td>
          <td style="padding:6px; border-top:1px solid #e2e8f0; text-align:right;">${amount(it.rate, invoice.currency)}</td>
          <td style="padding:6px; border-top:1px solid #e2e8f0; text-align:right;">${amount(it.line_total, invoice.currency)}</td>
        </tr>`,
    )
    .join("");

  const portalLink = buildPortalLink(invoice);
  const html = buildHtmlBody({
    invoice,
    orgName,
    clientName: client.name,
    portalLink,
    customMessage: options.message,
    itemsHtml,
  });
  const text = `Invoice ${invoice.invoice_number} from ${orgName}\nAmount Due: ${amount(invoice.amount_pending, invoice.currency)}\nView online: ${portalLink}`;

  let pdfBuffer: Buffer | null = null;
  let pdfFilename = `${invoice.invoice_number}.pdf`;
  try {
    const pdf = await generateInvoicePdf(organizationId, invoiceId);
    pdfBuffer = pdf.buffer;
    pdfFilename = pdf.filename;
  } catch {
    // Non-fatal: still send HTML even if PDF rendering fails.
  }

  const result = await sendMail({
    to,
    cc: options.cc,
    subject: `Invoice ${invoice.invoice_number} from ${orgName}`,
    html,
    text,
    attachments: pdfBuffer
      ? [{ filename: pdfFilename, content: pdfBuffer, contentType: "application/pdf" }]
      : undefined,
  });

  // Flip invoice status to 'sent' on the first successful send.
  if (invoice.status === "draft") {
    await markInvoiceSentService(organizationId, invoiceId);
  }

  // Seed reminders only once (if no existing scheduled reminders),
  // and only when the invoice has automatic reminders enabled.
  if (invoice.reminders_enabled) {
    const existing = await listRemindersByInvoice(pool, organizationId, invoiceId);
    const hasScheduled = existing.some((r) => r.status === "scheduled");
    if (!hasScheduled) {
      const offsets = invoice.reminder_offsets ?? [];
      if (offsets.length > 0) {
        const dueDate = invoice.due_date.toISOString().slice(0, 10);
        const seeds = seedRemindersFromOffsets(dueDate, offsets);
        await insertReminders(
          pool,
          seeds.map((s) => ({
            invoiceId,
            organizationId,
            type: s.type,
            offsetDays: s.offsetDays,
            scheduledFor: s.scheduledFor,
            channel: s.channel,
          })),
        );
      }
    }
  }

  return {
    delivered: result.delivered,
    mode: result.mode,
    messageId: result.messageId,
    error: result.error,
    portalLink,
  };
}

export async function sendReminderEmailService(
  reminderId: string,
  organizationId: string,
  invoiceId: string,
): Promise<void> {
  try {
    const invoice = await findAgencyInvoiceById(pool, organizationId, invoiceId);
    if (!invoice) {
      await updateReminderStatus(pool, reminderId, "failed", null, "Invoice missing");
      return;
    }
    if (invoice.status === "paid" || invoice.status === "cancelled") {
      await updateReminderStatus(pool, reminderId, "cancelled", null, null);
      return;
    }

    const result = await sendInvoiceEmailService(organizationId, invoiceId, {
      message: "This is a reminder for your outstanding invoice.",
    });
    if (result.delivered || result.mode === "stub") {
      await updateReminderStatus(pool, reminderId, "sent", new Date(), null);
    } else {
      await updateReminderStatus(
        pool,
        reminderId,
        "failed",
        null,
        result.error ?? "Unknown error",
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reminder dispatch failed";
    await updateReminderStatus(pool, reminderId, "failed", null, message);
  }
}
