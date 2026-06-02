import type { Pool, PoolClient } from "pg";

import type {
  AgencyInvoiceItemRow,
  AgencyInvoiceRow,
  AgencyInvoiceStatus,
} from "../types/agencyInvoice.js";

type Executor = Pool | PoolClient;

const INVOICE_COLUMNS = `
  id, organization_id, client_id, project_id, invoice_number, issue_date, due_date,
  currency, status, payment_terms, notes, place_of_supply,
  subtotal, discount_total, cgst_total, sgst_total, igst_total, tax_total,
  grand_total, amount_received, amount_pending,
  amounts_inclusive_of_tax, reminders_enabled, reminder_offsets,
  portal_token, sent_at, viewed_at,
  created_by_org_user_id, created_by_name, created_by_email,
  created_at, updated_at, deleted_at
`;

const ITEM_COLUMNS = `
  id, invoice_id, organization_id, position, item_name, description, hsn_code,
  qty, rate, discount_percent, tax_percent, line_subtotal,
  cgst_amount, sgst_amount, igst_amount, tax_amount, line_total
`;

export type InsertInvoiceParams = {
  organizationId: string;
  clientId: string;
  projectId: string | null;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  status: AgencyInvoiceStatus;
  paymentTerms: string | null;
  notes: string | null;
  placeOfSupply: string | null;
  subtotal: number;
  discountTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  taxTotal: number;
  grandTotal: number;
  amountReceived: number;
  amountPending: number;
  amountsInclusiveOfTax: boolean;
  remindersEnabled: boolean;
  reminderOffsets: number[] | null;
  createdByOrgUserId: string;
  createdByName: string;
  createdByEmail: string;
};

export async function insertAgencyInvoice(
  exec: Executor,
  params: InsertInvoiceParams,
): Promise<AgencyInvoiceRow> {
  const result = await exec.query<AgencyInvoiceRow>(
    `
      INSERT INTO agency_invoices (
        organization_id, client_id, project_id, invoice_number, issue_date, due_date,
        currency, status, payment_terms, notes, place_of_supply,
        subtotal, discount_total, cgst_total, sgst_total, igst_total, tax_total,
        grand_total, amount_received, amount_pending,
        amounts_inclusive_of_tax, reminders_enabled, reminder_offsets,
        created_by_org_user_id, created_by_name, created_by_email
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
      RETURNING ${INVOICE_COLUMNS};
    `,
    [
      params.organizationId,
      params.clientId,
      params.projectId,
      params.invoiceNumber,
      params.issueDate,
      params.dueDate,
      params.currency,
      params.status,
      params.paymentTerms,
      params.notes,
      params.placeOfSupply,
      params.subtotal,
      params.discountTotal,
      params.cgstTotal,
      params.sgstTotal,
      params.igstTotal,
      params.taxTotal,
      params.grandTotal,
      params.amountReceived,
      params.amountPending,
      params.amountsInclusiveOfTax,
      params.remindersEnabled,
      params.reminderOffsets,
      params.createdByOrgUserId,
      params.createdByName,
      params.createdByEmail,
    ],
  );
  return result.rows[0];
}

export async function findAgencyInvoiceById(
  exec: Executor,
  organizationId: string,
  id: string,
): Promise<AgencyInvoiceRow | null> {
  const result = await exec.query<AgencyInvoiceRow>(
    `
      SELECT ${INVOICE_COLUMNS}
      FROM agency_invoices
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      LIMIT 1;
    `,
    [id, organizationId],
  );
  return result.rows[0] ?? null;
}

export async function findAgencyInvoiceByPortalToken(
  exec: Executor,
  token: string,
): Promise<AgencyInvoiceRow | null> {
  const result = await exec.query<AgencyInvoiceRow>(
    `
      SELECT ${INVOICE_COLUMNS}
      FROM agency_invoices
      WHERE portal_token = $1 AND deleted_at IS NULL
      LIMIT 1;
    `,
    [token],
  );
  return result.rows[0] ?? null;
}

export type ListInvoicesFilters = {
  search?: string;
  clientId?: string;
  status?: AgencyInvoiceStatus;
  from?: string;
  to?: string;
  currency?: string;
  createdBy?: string;
  overdue?: boolean;
  page: number;
  limit: number;
};

export type ListInvoicesResult = {
  items: AgencyInvoiceRow[];
  total: number;
  page: number;
  limit: number;
};

export async function listAgencyInvoices(
  exec: Executor,
  organizationId: string,
  filters: ListInvoicesFilters,
): Promise<ListInvoicesResult> {
  const where: string[] = ["organization_id = $1", "deleted_at IS NULL"];
  const params: unknown[] = [organizationId];

  if (filters.clientId) {
    params.push(filters.clientId);
    where.push(`client_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  }
  if (filters.currency) {
    params.push(filters.currency);
    where.push(`currency = $${params.length}`);
  }
  if (filters.createdBy) {
    params.push(filters.createdBy);
    where.push(`created_by_org_user_id = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    where.push(`issue_date >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    where.push(`issue_date <= $${params.length}`);
  }
  if (filters.overdue) {
    where.push(
      `(status NOT IN ('paid','cancelled') AND due_date < CURRENT_DATE AND amount_pending > 0)`,
    );
  }
  if (filters.search && filters.search.length > 0) {
    params.push(`%${filters.search.toLowerCase()}%`);
    const p = `$${params.length}`;
    where.push(
      `(lower(invoice_number) LIKE ${p} OR lower(created_by_name) LIKE ${p} OR lower(created_by_email) LIKE ${p} OR lower(coalesce(notes, '')) LIKE ${p})`,
    );
  }

  const whereClause = where.join(" AND ");

  const countResult = await exec.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM agency_invoices WHERE ${whereClause};`,
    params,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const limit = filters.limit;
  const offset = (filters.page - 1) * limit;
  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  const rows = await exec.query<AgencyInvoiceRow>(
    `
      SELECT ${INVOICE_COLUMNS}
      FROM agency_invoices
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam};
    `,
    params,
  );

  return { items: rows.rows, total, page: filters.page, limit };
}

/** Slim rows for report PDF / UI-parity tables (same filters as list, no hydration). */
export type AgencyInvoicePdfTableRow = {
  invoice_number: string;
  client_name: string;
  issue_date: string;
  due_date: string;
  status: string;
  currency: string;
  grand_total: string;
  amount_pending: string;
};

export async function listAgencyInvoiceRowsForReportPdf(
  exec: Executor,
  organizationId: string,
  filters: {
    fromInclusive: string;
    toInclusive: string;
    clientId?: string;
    limit: number;
  },
): Promise<AgencyInvoicePdfTableRow[]> {
  const where: string[] = ["i.organization_id = $1", "i.deleted_at IS NULL"];
  const params: unknown[] = [organizationId];
  let i = 2;

  params.push(filters.fromInclusive);
  where.push(`i.issue_date >= $${i}::date`);
  i++;

  params.push(filters.toInclusive);
  where.push(`i.issue_date <= $${i}::date`);
  i++;

  if (filters.clientId) {
    params.push(filters.clientId);
    where.push(`i.client_id = $${i}::uuid`);
    i++;
  }

  params.push(filters.limit);
  const limitPl = `$${params.length}`;

  const result = await exec.query<AgencyInvoicePdfTableRow>(
    `
      SELECT
        i.invoice_number,
        c.name AS client_name,
        i.issue_date::text AS issue_date,
        i.due_date::text AS due_date,
        i.status::text AS status,
        i.currency,
        i.grand_total::text AS grand_total,
        i.amount_pending::text AS amount_pending
      FROM agency_invoices i
      INNER JOIN agency_clients c ON c.id = i.client_id
      WHERE ${where.join(" AND ")}
      ORDER BY i.created_at DESC
      LIMIT ${limitPl};
    `,
    params,
  );
  return result.rows;
}

export type UpdateInvoicePatch = {
  client_id?: string;
  project_id?: string | null;
  issue_date?: string;
  due_date?: string;
  currency?: string;
  status?: AgencyInvoiceStatus;
  payment_terms?: string | null;
  notes?: string | null;
  place_of_supply?: string | null;
  subtotal?: number;
  discount_total?: number;
  cgst_total?: number;
  sgst_total?: number;
  igst_total?: number;
  tax_total?: number;
  grand_total?: number;
  amount_received?: number;
  amount_pending?: number;
  amounts_inclusive_of_tax?: boolean;
  reminders_enabled?: boolean;
  reminder_offsets?: number[] | null;
  sent_at?: Date | null;
  viewed_at?: Date | null;
};

export async function updateAgencyInvoice(
  exec: Executor,
  organizationId: string,
  id: string,
  patch: UpdateInvoicePatch,
): Promise<AgencyInvoiceRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [];

  (Object.keys(patch) as Array<keyof UpdateInvoicePatch>).forEach((key) => {
    const value = patch[key];
    if (value === undefined) return;
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  });

  if (sets.length === 0) {
    return findAgencyInvoiceById(exec, organizationId, id);
  }

  sets.push("updated_at = NOW()");

  params.push(id);
  const idParam = `$${params.length}`;
  params.push(organizationId);
  const orgParam = `$${params.length}`;

  const result = await exec.query<AgencyInvoiceRow>(
    `
      UPDATE agency_invoices
      SET ${sets.join(", ")}
      WHERE id = ${idParam}
        AND organization_id = ${orgParam}
        AND deleted_at IS NULL
      RETURNING ${INVOICE_COLUMNS};
    `,
    params,
  );
  return result.rows[0] ?? null;
}

export async function softDeleteAgencyInvoice(
  exec: Executor,
  organizationId: string,
  id: string,
): Promise<boolean> {
  const result = await exec.query(
    `
      UPDATE agency_invoices
      SET deleted_at = NOW(), status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL;
    `,
    [id, organizationId],
  );
  return (result.rowCount ?? 0) > 0;
}

export type InsertInvoiceItemParams = {
  invoiceId: string;
  organizationId: string;
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

export async function insertInvoiceItems(
  exec: Executor,
  items: InsertInvoiceItemParams[],
): Promise<AgencyInvoiceItemRow[]> {
  if (items.length === 0) return [];

  const values: string[] = [];
  const params: unknown[] = [];
  items.forEach((it) => {
    const base = params.length;
    values.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}, $${base + 16})`,
    );
    params.push(
      it.invoiceId,
      it.organizationId,
      it.position,
      it.itemName,
      it.description,
      it.hsnCode,
      it.qty,
      it.rate,
      it.discountPercent,
      it.taxPercent,
      it.lineSubtotal,
      it.cgstAmount,
      it.sgstAmount,
      it.igstAmount,
      it.taxAmount,
      it.lineTotal,
    );
  });

  const result = await exec.query<AgencyInvoiceItemRow>(
    `
      INSERT INTO agency_invoice_items (
        invoice_id, organization_id, position, item_name, description, hsn_code,
        qty, rate, discount_percent, tax_percent, line_subtotal,
        cgst_amount, sgst_amount, igst_amount, tax_amount, line_total
      )
      VALUES ${values.join(", ")}
      RETURNING ${ITEM_COLUMNS};
    `,
    params,
  );
  return result.rows;
}

export async function findInvoiceItemsByInvoice(
  exec: Executor,
  organizationId: string,
  invoiceId: string,
): Promise<AgencyInvoiceItemRow[]> {
  const result = await exec.query<AgencyInvoiceItemRow>(
    `
      SELECT ${ITEM_COLUMNS}
      FROM agency_invoice_items
      WHERE invoice_id = $1 AND organization_id = $2
      ORDER BY position ASC;
    `,
    [invoiceId, organizationId],
  );
  return result.rows;
}

export async function deleteInvoiceItems(
  exec: Executor,
  organizationId: string,
  invoiceId: string,
): Promise<void> {
  await exec.query(
    `
      DELETE FROM agency_invoice_items
      WHERE invoice_id = $1 AND organization_id = $2;
    `,
    [invoiceId, organizationId],
  );
}

export async function rotatePortalToken(
  exec: Executor,
  organizationId: string,
  invoiceId: string,
): Promise<string> {
  const result = await exec.query<{ portal_token: string }>(
    `
      UPDATE agency_invoices
      SET portal_token = gen_random_uuid(), updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      RETURNING portal_token;
    `,
    [invoiceId, organizationId],
  );
  return result.rows[0]?.portal_token ?? "";
}

export async function markInvoicePortalViewed(
  exec: Executor,
  token: string,
): Promise<void> {
  await exec.query(
    `
      UPDATE agency_invoices
      SET viewed_at = COALESCE(viewed_at, NOW()),
          status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END,
          updated_at = NOW()
      WHERE portal_token = $1 AND deleted_at IS NULL;
    `,
    [token],
  );
}
