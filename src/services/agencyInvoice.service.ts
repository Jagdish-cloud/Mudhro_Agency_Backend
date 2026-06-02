import type { PoolClient } from "pg";

import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import {
  assertReminderOffsets,
  buildReminderSchedule,
  seedRemindersFromOffsets,
} from "../lib/invoiceReminderSchedule.js";
import {
  findAgencyClientById,
} from "../repositories/agencyClient.repository.js";
import {
  deleteInstallmentsByInvoice,
  insertInstallments,
  listInstallmentsByInvoice,
} from "../repositories/agencyInstallment.repository.js";
import {
  deleteInvoiceItems,
  findAgencyInvoiceById,
  findInvoiceItemsByInvoice,
  insertAgencyInvoice,
  insertInvoiceItems,
  listAgencyInvoices as listAgencyInvoicesRepo,
  rotatePortalToken,
  softDeleteAgencyInvoice,
  updateAgencyInvoice,
  type ListInvoicesFilters,
  type UpdateInvoicePatch,
} from "../repositories/agencyInvoice.repository.js";
import { allocateInvoiceSequence } from "../repositories/agencyInvoiceSequence.repository.js";
import { listClientIdsForProject } from "../repositories/agencyProjectClient.repository.js";
import { sumPaymentDeductionsByInvoice } from "../repositories/agencyPayment.repository.js";
import {
  cancelScheduledRemindersByInvoice,
  insertReminders,
  listRemindersByInvoice,
} from "../repositories/agencyReminder.repository.js";
import {
  toAgencyInvoiceDto,
  type AgencyInvoiceAggregate,
  type AgencyInvoiceDto,
  type AgencyInvoiceStatus,
} from "../types/agencyInvoice.js";
import type { AuthPayload } from "../types/auth.js";
import { HttpError } from "../utils/httpError.js";
import type {
  CreateInvoiceInput,
  InstallmentInput,
  InvoiceItemInput,
  ListInvoicesQuery,
  UpdateInvoiceInput,
} from "../validators/agencyInvoice.schema.js";

type OrgRow = {
  id: string;
  name: string;
  state_code: string | null;
  gst_number: string | null;
  company_email: string;
  company_mobile: string;
  address: string;
  logo_path: string | null;
};

type CreatorRow = {
  id: string;
  name: string;
  email: string;
};

async function fetchOrganization(
  exec: PoolClient,
  organizationId: string,
): Promise<OrgRow> {
  const result = await exec.query<OrgRow>(
    `
      SELECT id, name, state_code, gst_number, company_email, company_mobile,
             address, logo_path
      FROM organizations
      WHERE id = $1
      LIMIT 1;
    `,
    [organizationId],
  );
  const org = result.rows[0];
  if (!org) throw new HttpError(404, "Organization not found.");
  return org;
}

async function assertClientAssignedToProjectIfNeeded(
  exec: PoolClient,
  organizationId: string,
  projectId: string | null | undefined,
  clientId: string,
): Promise<void> {
  if (!projectId) return;
  const ids = await listClientIdsForProject(exec, organizationId, projectId);
  if (!ids.includes(clientId)) {
    throw new HttpError(400, "Client is not assigned to this project.");
  }
}

async function fetchCreator(
  exec: PoolClient,
  organizationId: string,
  userId: string,
): Promise<CreatorRow> {
  const result = await exec.query<CreatorRow>(
    `
      SELECT id, name, email
      FROM organization_admins
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      LIMIT 1;
    `,
    [userId, organizationId],
  );
  const user = result.rows[0];
  if (!user) throw new HttpError(403, "Creator is not an active member of this organization.");
  return user;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type LineComputed = {
  position: number;
  itemName: string;
  description: string | null;
  hsnCode: string;
  qty: number;
  rate: number;
  discountPercent: number;
  taxPercent: number;
  lineSubtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  taxAmount: number;
  lineTotal: number;
};

export type ComputedTotals = {
  subtotal: number;
  discountTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  taxTotal: number;
  grandTotal: number;
};

export function computeInvoiceLines(
  items: InvoiceItemInput[],
  sellerStateCode: string | null,
  buyerStateCode: string | null,
  amountsInclusiveOfTax: boolean = false,
): { lines: LineComputed[]; totals: ComputedTotals } {
  // Same-state (CGST+SGST) only when both codes are known and equal.
  const isIntraState =
    Boolean(sellerStateCode) &&
    Boolean(buyerStateCode) &&
    sellerStateCode === buyerStateCode;

  const lines: LineComputed[] = [];
  let subtotal = 0;
  let discountTotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;

  items.forEach((it, idx) => {
    const taxPct = it.taxPercent ?? 0;
    // When the entered rate is "inclusive of GST", back-calculate the net rate
    // so the rest of the math (CGST/SGST/IGST split, line totals) stays the
    // same as for tax-exclusive invoices.
    const effectiveRate =
      amountsInclusiveOfTax && taxPct > 0
        ? it.rate / (1 + taxPct / 100)
        : it.rate;
    const grossLine = round2(it.qty * effectiveRate);
    const discountAmount = round2((grossLine * (it.discountPercent ?? 0)) / 100);
    const lineSubtotal = round2(grossLine - discountAmount);
    const taxAmount = round2((lineSubtotal * taxPct) / 100);

    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;
    if (isIntraState) {
      cgstAmount = round2(taxAmount / 2);
      sgstAmount = round2(taxAmount - cgstAmount);
    } else {
      igstAmount = taxAmount;
    }

    const lineTotal = round2(lineSubtotal + taxAmount);

    subtotal = round2(subtotal + grossLine);
    discountTotal = round2(discountTotal + discountAmount);
    cgstTotal = round2(cgstTotal + cgstAmount);
    sgstTotal = round2(sgstTotal + sgstAmount);
    igstTotal = round2(igstTotal + igstAmount);

    lines.push({
      position: idx + 1,
      itemName: it.itemName,
      description: it.description ?? null,
      hsnCode: it.hsnCode,
      qty: it.qty,
      // Persist the net rate so PDF/UI math is consistent regardless of how
      // the rate was entered.
      rate: round2(effectiveRate),
      discountPercent: it.discountPercent ?? 0,
      taxPercent: taxPct,
      lineSubtotal,
      cgstAmount,
      sgstAmount,
      igstAmount,
      taxAmount,
      lineTotal,
    });
  });

  const taxTotal = round2(cgstTotal + sgstTotal + igstTotal);
  const grandTotal = round2(subtotal - discountTotal + taxTotal);

  return {
    lines,
    totals: {
      subtotal,
      discountTotal,
      cgstTotal,
      sgstTotal,
      igstTotal,
      taxTotal,
      grandTotal,
    },
  };
}

function validateInstallments(
  installments: InstallmentInput[] | undefined,
  grandTotal: number,
): void {
  if (!installments || installments.length === 0) return;

  const sequences = new Set<number>();
  let sum = 0;
  installments.forEach((it) => {
    if (sequences.has(it.sequence)) {
      throw new HttpError(400, `Duplicate installment sequence: ${it.sequence}.`);
    }
    sequences.add(it.sequence);
    sum = round2(sum + it.amount);
  });

  if (round2(sum) !== round2(grandTotal)) {
    throw new HttpError(
      400,
      `Installment total (${sum}) must equal grand total (${grandTotal}).`,
    );
  }
}

function invoiceDateOnly(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function syncInvoiceReminders(
  exec: PoolClient,
  organizationId: string,
  invoiceId: string,
  dueDate: string,
  offsets: number[],
): Promise<void> {
  await cancelScheduledRemindersByInvoice(exec, organizationId, invoiceId);
  const seeds = buildReminderSchedule(dueDate, offsets);
  if (seeds.length === 0) return;
  await insertReminders(
    exec,
    seeds.map((seed) => ({
      invoiceId,
      organizationId,
      type: seed.type,
      offsetDays: seed.offsetDays,
      scheduledFor: seed.scheduledFor,
      channel: seed.channel,
    })),
  );
}

function shouldSyncRemindersForStatus(status: AgencyInvoiceStatus): boolean {
  return status !== "draft" && status !== "paid" && status !== "cancelled";
}

export function formatInvoiceNumber(year: number, seq: number): string {
  const padded = String(seq).padStart(env.INVOICE_NUMBER_PAD, "0");
  return `${env.INVOICE_NUMBER_PREFIX}-${year}-${padded}`;
}

export { seedRemindersFromOffsets };

export async function createAgencyInvoiceService(
  organizationId: string,
  actor: AuthPayload,
  input: CreateInvoiceInput,
): Promise<AgencyInvoiceDto> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const clientRow = await findAgencyClientById(client, organizationId, input.clientId);
    if (!clientRow) throw new HttpError(404, "Client not found in this organization.");
    if (clientRow.organization_id !== organizationId) {
      // Extra belt-and-braces check; the repo already filters by org.
      throw new HttpError(403, "Client belongs to a different organization.");
    }

    await assertClientAssignedToProjectIfNeeded(
      client,
      organizationId,
      input.projectId ?? null,
      clientRow.id,
    );

    const org = await fetchOrganization(client, organizationId);
    const creator = await fetchCreator(client, organizationId, actor.id);

    const { lines, totals } = computeInvoiceLines(
      input.items,
      org.state_code,
      clientRow.state_code,
      input.amountsInclusiveOfTax,
    );

    // Apply manual discountTotal on top if provided; it shifts the grandTotal.
    const manualDiscount = round2(input.discountTotal ?? 0);
    const finalDiscount = round2(totals.discountTotal + manualDiscount);
    const finalGrand = round2(totals.subtotal - finalDiscount + totals.taxTotal);
    if (finalGrand < 0) {
      throw new HttpError(400, "Discount exceeds the invoice total.");
    }

    validateInstallments(input.installments, finalGrand);

    const reminderOffsets = assertReminderOffsets(
      input.reminderOffsets,
      input.remindersEnabled,
    );

    const issueYear = Number(input.issueDate.slice(0, 4));
    const invoiceNumber =
      input.invoiceNumber ??
      formatInvoiceNumber(issueYear, await allocateInvoiceSequence(client, organizationId, issueYear));

    const invoice = await insertAgencyInvoice(client, {
      organizationId,
      clientId: clientRow.id,
      projectId: input.projectId ?? null,
      invoiceNumber,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      currency: input.currency,
      status: input.status,
      paymentTerms: input.paymentTerms ?? null,
      notes: input.notes ?? null,
      placeOfSupply: input.placeOfSupply ?? clientRow.state_code ?? null,
      subtotal: totals.subtotal,
      discountTotal: finalDiscount,
      cgstTotal: totals.cgstTotal,
      sgstTotal: totals.sgstTotal,
      igstTotal: totals.igstTotal,
      taxTotal: totals.taxTotal,
      grandTotal: finalGrand,
      amountReceived: 0,
      amountPending: finalGrand,
      amountsInclusiveOfTax: input.amountsInclusiveOfTax,
      remindersEnabled: input.remindersEnabled,
      reminderOffsets,
      createdByOrgUserId: creator.id,
      createdByName: creator.name,
      createdByEmail: creator.email,
    });

    const itemRows = await insertInvoiceItems(
      client,
      lines.map((l) => ({
        invoiceId: invoice.id,
        organizationId,
        position: l.position,
        itemName: l.itemName,
        description: l.description,
        hsnCode: l.hsnCode,
        qty: l.qty,
        rate: l.rate,
        discountPercent: l.discountPercent,
        taxPercent: l.taxPercent,
        lineSubtotal: l.lineSubtotal,
        cgstAmount: l.cgstAmount,
        sgstAmount: l.sgstAmount,
        igstAmount: l.igstAmount,
        taxAmount: l.taxAmount,
        lineTotal: l.lineTotal,
      })),
    );

    const installmentRows =
      input.installments && input.installments.length > 0
        ? await insertInstallments(
            client,
            input.installments.map((it) => ({
              invoiceId: invoice.id,
              organizationId,
              sequence: it.sequence,
              dueDate: it.dueDate,
              amount: it.amount,
            })),
          )
        : [];

    let reminderRows = [] as Awaited<ReturnType<typeof insertReminders>>;
    if (input.reminders && input.reminders.length > 0) {
      reminderRows = await insertReminders(
        client,
        input.reminders.map((r) => ({
          invoiceId: invoice.id,
          organizationId,
          type: r.type,
          offsetDays: r.offsetDays,
          scheduledFor: new Date(r.scheduledFor),
          channel: r.channel,
        })),
      );
    }

    await client.query("COMMIT");

    const aggregate: AgencyInvoiceAggregate = {
      invoice,
      items: itemRows,
      installments: installmentRows,
      reminders: reminderRows,
    };
    return toAgencyInvoiceDto(aggregate);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof HttpError) throw error;
    const dbError = error as { code?: string; message?: string };
    if (dbError?.code === "23505") {
      throw new HttpError(409, "Invoice number already exists for this organization.");
    }
    throw error;
  } finally {
    client.release();
  }
}

export type ListAgencyInvoicesResult = {
  items: AgencyInvoiceDto[];
  total: number;
  page: number;
  limit: number;
};

export async function listAgencyInvoicesService(
  organizationId: string,
  query: ListInvoicesQuery,
): Promise<ListAgencyInvoicesResult> {
  const filters: ListInvoicesFilters = {
    search: query.search,
    clientId: query.clientId,
    status: query.status,
    from: query.from,
    to: query.to,
    currency: query.currency,
    createdBy: query.createdBy,
    overdue: query.overdue,
    page: query.page,
    limit: query.limit,
  };
  const result = await listAgencyInvoicesRepo(pool, organizationId, filters);

  // Hydrate each invoice with its items/installments/reminders for a complete
  // list payload. For high-scale we might defer items to the detail endpoint.
  const hydrated = await Promise.all(
    result.items.map(async (inv) => {
      const [items, installments, reminders] = await Promise.all([
        findInvoiceItemsByInvoice(pool, organizationId, inv.id),
        listInstallmentsByInvoice(pool, organizationId, inv.id),
        listRemindersByInvoice(pool, organizationId, inv.id),
      ]);
      return toAgencyInvoiceDto({ invoice: inv, items, installments, reminders });
    }),
  );

  return {
    items: hydrated,
    total: result.total,
    page: result.page,
    limit: result.limit,
  };
}

export async function getAgencyInvoiceService(
  organizationId: string,
  id: string,
): Promise<AgencyInvoiceDto> {
  const invoice = await findAgencyInvoiceById(pool, organizationId, id);
  if (!invoice) throw new HttpError(404, "Invoice not found.");
  const [items, installments, reminders] = await Promise.all([
    findInvoiceItemsByInvoice(pool, organizationId, id),
    listInstallmentsByInvoice(pool, organizationId, id),
    listRemindersByInvoice(pool, organizationId, id),
  ]);
  return toAgencyInvoiceDto({ invoice, items, installments, reminders });
}

export async function updateAgencyInvoiceService(
  organizationId: string,
  actor: AuthPayload,
  id: string,
  input: UpdateInvoiceInput,
): Promise<AgencyInvoiceDto> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await findAgencyInvoiceById(client, organizationId, id);
    if (!existing) throw new HttpError(404, "Invoice not found.");

    // Members (role !== 1) and admins can both create/edit invoices. Deletion,
    // sending, recording payments, rotating portal tokens and attachment
    // management remain admin-only and are enforced by requireOrgAdmin on the
    // corresponding routes. Nobody may mutate a finalized (paid/cancelled)
    // invoice.
    if (existing.status === "paid" || existing.status === "cancelled") {
      throw new HttpError(409, `Cannot modify a ${existing.status} invoice.`);
    }
    void actor;

    const clientRow = input.clientId
      ? await findAgencyClientById(client, organizationId, input.clientId)
      : null;
    if (input.clientId && !clientRow) {
      throw new HttpError(404, "Client not found in this organization.");
    }

    let recompute = Boolean(input.items);
    let itemRows = await findInvoiceItemsByInvoice(client, organizationId, id);
    let installmentRows = await listInstallmentsByInvoice(client, organizationId, id);

    const patch: UpdateInvoicePatch = {};
    if (input.clientId) patch.client_id = input.clientId;
    if (input.projectId !== undefined) patch.project_id = input.projectId;
    if (input.issueDate) patch.issue_date = input.issueDate;
    if (input.dueDate) patch.due_date = input.dueDate;
    if (input.currency) patch.currency = input.currency;
    if (input.status) patch.status = input.status;
    if (input.paymentTerms !== undefined) patch.payment_terms = input.paymentTerms ?? null;
    if (input.notes !== undefined) patch.notes = input.notes ?? null;
    if (input.placeOfSupply !== undefined) patch.place_of_supply = input.placeOfSupply ?? null;
    if (input.amountsInclusiveOfTax !== undefined) {
      patch.amounts_inclusive_of_tax = input.amountsInclusiveOfTax;
    }
    if (input.remindersEnabled !== undefined) {
      patch.reminders_enabled = input.remindersEnabled;
    }

    const nextRemindersEnabled =
      input.remindersEnabled ?? existing.reminders_enabled;
    const reminderSelectionChanged =
      input.reminderOffsets !== undefined || input.remindersEnabled !== undefined;
    let nextReminderOffsets = existing.reminder_offsets;

    if (reminderSelectionChanged) {
      nextReminderOffsets = assertReminderOffsets(
        input.reminderOffsets ?? existing.reminder_offsets ?? undefined,
        nextRemindersEnabled,
      );
      patch.reminder_offsets = nextReminderOffsets;
    }

    const nextDueDate = input.dueDate ?? invoiceDateOnly(existing.due_date);
    const dueDateChanged = input.dueDate !== undefined;

    // If the inclusive flag is being toggled, recompute even when the items
    // themselves were not touched, so totals stay consistent with the flag.
    if (
      !recompute &&
      input.amountsInclusiveOfTax !== undefined &&
      input.amountsInclusiveOfTax !== existing.amounts_inclusive_of_tax
    ) {
      recompute = true;
    }

    if (recompute) {
      const org = await fetchOrganization(client, organizationId);
      const resolvedClient =
        clientRow ?? (await findAgencyClientById(client, organizationId, existing.client_id));
      if (!resolvedClient) throw new HttpError(404, "Client not found.");

      const itemsForCompute =
        input.items ??
        itemRows.map((row) => ({
          itemName: row.item_name,
          description: row.description ?? undefined,
          hsnCode: row.hsn_code,
          qty: Number(row.qty),
          rate: Number(row.rate),
          discountPercent: Number(row.discount_percent),
          taxPercent: Number(row.tax_percent),
        }));
      const inclusiveFlag =
        input.amountsInclusiveOfTax ?? existing.amounts_inclusive_of_tax;

      const { lines, totals } = computeInvoiceLines(
        itemsForCompute,
        org.state_code,
        resolvedClient.state_code,
        inclusiveFlag,
      );

      const manualDiscount = round2(input.discountTotal ?? Number(existing.discount_total) - Number(totals.discountTotal));
      const finalDiscount = round2(totals.discountTotal + Math.max(0, manualDiscount));
      const finalGrand = round2(totals.subtotal - finalDiscount + totals.taxTotal);
      if (finalGrand < 0) throw new HttpError(400, "Discount exceeds invoice total.");

      patch.subtotal = totals.subtotal;
      patch.discount_total = finalDiscount;
      patch.cgst_total = totals.cgstTotal;
      patch.sgst_total = totals.sgstTotal;
      patch.igst_total = totals.igstTotal;
      patch.tax_total = totals.taxTotal;
      patch.grand_total = finalGrand;
      const paymentDeductions = await sumPaymentDeductionsByInvoice(client, organizationId, id);
      patch.amount_pending = Math.max(
        0,
        round2(finalGrand - Number(existing.amount_received) - paymentDeductions),
      );

      await deleteInvoiceItems(client, organizationId, id);
      itemRows = await insertInvoiceItems(
        client,
        lines.map((l) => ({
          invoiceId: id,
          organizationId,
          position: l.position,
          itemName: l.itemName,
          description: l.description,
          hsnCode: l.hsnCode,
          qty: l.qty,
          rate: l.rate,
          discountPercent: l.discountPercent,
          taxPercent: l.taxPercent,
          lineSubtotal: l.lineSubtotal,
          cgstAmount: l.cgstAmount,
          sgstAmount: l.sgstAmount,
          igstAmount: l.igstAmount,
          taxAmount: l.taxAmount,
          lineTotal: l.lineTotal,
        })),
      );

      if (input.installments) {
        validateInstallments(input.installments, finalGrand);
        await deleteInstallmentsByInvoice(client, organizationId, id);
        installmentRows = await insertInstallments(
          client,
          input.installments.map((it) => ({
            invoiceId: id,
            organizationId,
            sequence: it.sequence,
            dueDate: it.dueDate,
            amount: it.amount,
          })),
        );
      }
    } else if (input.installments) {
      // Items not changed; validate installments against existing grand_total.
      validateInstallments(input.installments, Number(existing.grand_total));
      await deleteInstallmentsByInvoice(client, organizationId, id);
      installmentRows = await insertInstallments(
        client,
        input.installments.map((it) => ({
          invoiceId: id,
          organizationId,
          sequence: it.sequence,
          dueDate: it.dueDate,
          amount: it.amount,
        })),
      );
    }

    const effectiveProjectId =
      input.projectId !== undefined ? input.projectId : existing.project_id;
    const effectiveClientId = input.clientId ?? existing.client_id;
    await assertClientAssignedToProjectIfNeeded(
      client,
      organizationId,
      effectiveProjectId,
      effectiveClientId,
    );

    const updated = await updateAgencyInvoice(client, organizationId, id, patch);
    if (!updated) throw new HttpError(404, "Invoice not found.");

    if (reminderSelectionChanged && !nextRemindersEnabled) {
      await cancelScheduledRemindersByInvoice(client, organizationId, id);
    } else if (
      shouldSyncRemindersForStatus(updated.status) &&
      nextRemindersEnabled &&
      nextReminderOffsets &&
      nextReminderOffsets.length > 0 &&
      (reminderSelectionChanged || dueDateChanged)
    ) {
      await syncInvoiceReminders(
        client,
        organizationId,
        id,
        nextDueDate,
        nextReminderOffsets,
      );
    }

    const reminderRows = await listRemindersByInvoice(client, organizationId, id);

    await client.query("COMMIT");

    return toAgencyInvoiceDto({
      invoice: updated,
      items: itemRows,
      installments: installmentRows,
      reminders: reminderRows,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteAgencyInvoiceService(
  organizationId: string,
  actor: AuthPayload,
  id: string,
): Promise<void> {
  const existing = await findAgencyInvoiceById(pool, organizationId, id);
  if (!existing) throw new HttpError(404, "Invoice not found.");

  if (actor.role !== 1) {
    throw new HttpError(403, "Only admins can delete invoices.");
  }
  if (Number(existing.amount_received) > 0) {
    throw new HttpError(
      409,
      "Cannot delete an invoice that has recorded payments.",
    );
  }

  const removed = await softDeleteAgencyInvoice(pool, organizationId, id);
  if (!removed) throw new HttpError(404, "Invoice not found.");
}

export async function markInvoiceSentService(
  organizationId: string,
  invoiceId: string,
): Promise<void> {
  await updateAgencyInvoice(pool, organizationId, invoiceId, {
    status: "sent",
    sent_at: new Date(),
  });
}

export async function rotateInvoicePortalTokenService(
  organizationId: string,
  invoiceId: string,
): Promise<string> {
  const existing = await findAgencyInvoiceById(pool, organizationId, invoiceId);
  if (!existing) throw new HttpError(404, "Invoice not found.");
  return rotatePortalToken(pool, organizationId, invoiceId);
}
