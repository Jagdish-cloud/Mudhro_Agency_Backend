import { pool } from "../db/pool.js";
import type { BoundedPeriod } from "../utils/agencyReportPeriod.js";
import { resolveBoundedPeriod, resolvePendingDueDatePeriod } from "../utils/agencyReportPeriod.js";
import type { AgencyReportPeriodQuery } from "../validators/agencyReport.schema.js";
import { findAgencyClientById } from "../repositories/agencyClient.repository.js";
import { listExpensesByOrgFiltered } from "../repositories/agencyExpense.repository.js";
import { listAgencyInvoiceRowsForReportPdf } from "../repositories/agencyInvoice.repository.js";
import { HttpError } from "../utils/httpError.js";
import { formatDateYmd } from "../utils/formatDateYmd.js";

/** Same row cap as reports UI tables. */
export const REPORT_PDF_TABLE_LIMIT = 500;

export type ReportPdfInvoiceRow = {
  invoiceNumber: string;
  clientName: string;
  issueDate: string;
  dueDate: string;
  status: string;
  currency: string;
  grandTotal: number;
  amountPending: number;
};

export type ReportPdfExpenseRow = {
  billLabel: string;
  vendorName: string;
  billDate: string;
  dueDate: string;
  totalAmount: number;
};

export type ReportPdfTables = {
  invoiceRows: ReportPdfInvoiceRow[];
  expenseRows: ReportPdfExpenseRow[];
};

export async function getReportPdfTables(
  organizationId: string,
  period: BoundedPeriod,
  clientId?: string | null,
): Promise<ReportPdfTables> {
  const limit = REPORT_PDF_TABLE_LIMIT;
  const [invRows, expRows] = await Promise.all([
    listAgencyInvoiceRowsForReportPdf(pool, organizationId, {
      fromInclusive: period.fromInclusive,
      toInclusive: period.toInclusive,
      clientId: clientId ?? undefined,
      limit,
    }),
    listExpensesByOrgFiltered(pool, organizationId, {
      fromInclusive: period.fromInclusive,
      toInclusive: period.toInclusive,
      clientId: clientId ?? undefined,
      limit,
    }),
  ]);

  return {
    invoiceRows: invRows.map((r) => ({
      invoiceNumber: r.invoice_number,
      clientName: r.client_name,
      issueDate: formatDateYmd(r.issue_date) || String(r.issue_date),
      dueDate: formatDateYmd(r.due_date) || String(r.due_date),
      status: r.status,
      currency: r.currency,
      grandTotal: Number(r.grand_total),
      amountPending: Number(r.amount_pending),
    })),
    expenseRows: expRows.map((r) => {
      const bill = r.bill_number != null ? String(r.bill_number).trim() : "";
      return {
        billLabel: bill.length > 0 ? bill : String(r.id).slice(0, 8),
        vendorName: r.vendor_name.trim().length > 0 ? r.vendor_name : "—",
        billDate: formatDateYmd(r.bill_date) || String(r.bill_date),
        dueDate: formatDateYmd(r.due_date) || String(r.due_date),
        totalAmount: Number(r.total_amount),
      };
    }),
  };
}

export type MonthlyReport = {
  month: string;
  currency: string;
  invoicedAmount: number;
  receivedAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  overdueCount: number;
  invoiceCount: number;
  paidCount: number;
  topClients: Array<{
    clientId: string;
    clientName: string;
    invoicedAmount: number;
    receivedAmount: number;
    invoiceCount: number;
  }>;
  statusBreakdown: Array<{ status: string; count: number; amount: number }>;
};

export type InvoiceReportSlice = {
  currency: string;
  invoicedAmount: number;
  receivedAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  overdueCount: number;
  invoiceCount: number;
  paidCount: number;
  topClients: MonthlyReport["topClients"];
  statusBreakdown: MonthlyReport["statusBreakdown"];
};

export type ExpenseVendorRow = {
  vendorId: string;
  vendorName: string;
  totalAmount: number;
  expenseCount: number;
};

export type ExpenseReportSlice = {
  expenseCount: number;
  expenseTotalAmount: number;
  topVendors: ExpenseVendorRow[];
};

export type OverallReportDto = {
  period: BoundedPeriod;
  invoices: InvoiceReportSlice;
  expenses: ExpenseReportSlice;
  netInvoicedMinusExpenses: number;
};

export type ClientReportDto = OverallReportDto & {
  clientId: string;
  clientName: string;
};

export type PaymentPendingInvoiceRow = {
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  grandTotal: number;
  amountPending: number;
  status: string;
};

export type PaymentPendingReportDto = {
  /** Present when due-date filters apply; omitted means all outstanding invoices */
  period: BoundedPeriod | null;
  items: PaymentPendingInvoiceRow[];
  totalPendingAmount: number;
  invoiceCount: number;
};

async function fetchInvoiceSlice(
  organizationId: string,
  period: BoundedPeriod,
  clientId: string | null,
): Promise<InvoiceReportSlice> {
  const totals = await pool.query<{
    invoiced: string;
    received: string;
    pending: string;
    invoice_count: string;
    paid_count: string;
    currency: string | null;
  }>(
    `
      SELECT
        COALESCE(SUM(grand_total), 0)::text AS invoiced,
        COALESCE(SUM(amount_received), 0)::text AS received,
        COALESCE(SUM(amount_pending), 0)::text AS pending,
        COUNT(*)::text AS invoice_count,
        COUNT(*) FILTER (WHERE status = 'paid')::text AS paid_count,
        MAX(currency) AS currency
      FROM agency_invoices
      WHERE organization_id = $1
        AND deleted_at IS NULL
        AND issue_date >= $2::date
        AND issue_date <= $3::date
        AND ($4::uuid IS NULL OR client_id = $4);
    `,
    [organizationId, period.fromInclusive, period.toInclusive, clientId],
  );

  const overdue = await pool.query<{ overdue_amount: string; overdue_count: string }>(
    `
      SELECT
        COALESCE(SUM(amount_pending), 0)::text AS overdue_amount,
        COUNT(*)::text AS overdue_count
      FROM agency_invoices
      WHERE organization_id = $1
        AND deleted_at IS NULL
        AND issue_date >= $2::date
        AND issue_date <= $3::date
        AND ($4::uuid IS NULL OR client_id = $4)
        AND status NOT IN ('paid', 'cancelled')
        AND due_date < CURRENT_DATE
        AND amount_pending > 0;
    `,
    [organizationId, period.fromInclusive, period.toInclusive, clientId],
  );

  const topClients = await pool.query<{
    client_id: string;
    client_name: string;
    invoiced: string;
    received: string;
    invoice_count: string;
  }>(
    `
      SELECT i.client_id AS client_id, c.name AS client_name,
             COALESCE(SUM(i.grand_total), 0)::text AS invoiced,
             COALESCE(SUM(i.amount_received), 0)::text AS received,
             COUNT(*)::text AS invoice_count
      FROM agency_invoices i
      JOIN agency_clients c ON c.id = i.client_id
      WHERE i.organization_id = $1
        AND i.deleted_at IS NULL
        AND i.issue_date >= $2::date
        AND i.issue_date <= $3::date
        AND ($4::uuid IS NULL OR i.client_id = $4)
      GROUP BY i.client_id, c.name
      ORDER BY SUM(i.grand_total) DESC
      LIMIT 5;
    `,
    [organizationId, period.fromInclusive, period.toInclusive, clientId],
  );

  const statusBreakdown = await pool.query<{ status: string; count: string; amount: string }>(
    `
      SELECT status, COUNT(*)::text AS count,
             COALESCE(SUM(grand_total), 0)::text AS amount
      FROM agency_invoices
      WHERE organization_id = $1
        AND deleted_at IS NULL
        AND issue_date >= $2::date
        AND issue_date <= $3::date
        AND ($4::uuid IS NULL OR client_id = $4)
      GROUP BY status;
    `,
    [organizationId, period.fromInclusive, period.toInclusive, clientId],
  );

  const t = totals.rows[0];
  return {
    currency: t?.currency ?? "INR",
    invoicedAmount: Number(t?.invoiced ?? 0),
    receivedAmount: Number(t?.received ?? 0),
    pendingAmount: Number(t?.pending ?? 0),
    overdueAmount: Number(overdue.rows[0]?.overdue_amount ?? 0),
    overdueCount: Number(overdue.rows[0]?.overdue_count ?? 0),
    invoiceCount: Number(t?.invoice_count ?? 0),
    paidCount: Number(t?.paid_count ?? 0),
    topClients: topClients.rows.map((r) => ({
      clientId: r.client_id,
      clientName: r.client_name,
      invoicedAmount: Number(r.invoiced),
      receivedAmount: Number(r.received),
      invoiceCount: Number(r.invoice_count),
    })),
    statusBreakdown: statusBreakdown.rows.map((r) => ({
      status: r.status,
      count: Number(r.count),
      amount: Number(r.amount),
    })),
  };
}

async function fetchExpenseSlice(
  organizationId: string,
  period: BoundedPeriod,
  clientId: string | null,
): Promise<ExpenseReportSlice> {
  const totals = await pool.query<{ cnt: string; total: string }>(
    `
      SELECT
        COUNT(*)::text AS cnt,
        COALESCE(SUM(e.total_amount), 0)::text AS total
      FROM agency_expenses e
      WHERE e.organization_id = $1
        AND e.bill_date >= $2::date
        AND e.bill_date <= $3::date
        AND (
          $4::uuid IS NULL
          OR EXISTS (
            SELECT 1 FROM agency_project_clients pc
            WHERE pc.organization_id = $1
              AND pc.project_id = e.project_id
              AND pc.client_id = $4
          )
        );
    `,
    [organizationId, period.fromInclusive, period.toInclusive, clientId],
  );

  const topVendors = await pool.query<{
    vendor_id: string;
    vendor_name: string;
    total: string;
    cnt: string;
  }>(
    `
      SELECT
        e.vendor_id,
        v.name AS vendor_name,
        COALESCE(SUM(e.total_amount), 0)::text AS total,
        COUNT(*)::text AS cnt
      FROM agency_expenses e
      INNER JOIN agency_vendors v ON v.id = e.vendor_id AND v.organization_id = e.organization_id
      WHERE e.organization_id = $1
        AND v.deleted_at IS NULL
        AND e.bill_date >= $2::date
        AND e.bill_date <= $3::date
        AND (
          $4::uuid IS NULL
          OR EXISTS (
            SELECT 1 FROM agency_project_clients pc
            WHERE pc.organization_id = $1
              AND pc.project_id = e.project_id
              AND pc.client_id = $4
          )
        )
      GROUP BY e.vendor_id, v.name
      ORDER BY SUM(e.total_amount) DESC
      LIMIT 5;
    `,
    [organizationId, period.fromInclusive, period.toInclusive, clientId],
  );

  const tr = totals.rows[0];
  return {
    expenseCount: Number(tr?.cnt ?? 0),
    expenseTotalAmount: Number(tr?.total ?? 0),
    topVendors: topVendors.rows.map((r) => ({
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      totalAmount: Number(r.total),
      expenseCount: Number(r.cnt),
    })),
  };
}

export async function getOverallReportService(
  organizationId: string,
  query: AgencyReportPeriodQuery,
): Promise<OverallReportDto> {
  const period = resolveBoundedPeriod(query);
  const [invoices, expenses] = await Promise.all([
    fetchInvoiceSlice(organizationId, period, null),
    fetchExpenseSlice(organizationId, period, null),
  ]);
  return {
    period,
    invoices,
    expenses,
    netInvoicedMinusExpenses: invoices.invoicedAmount - expenses.expenseTotalAmount,
  };
}

export async function getClientReportService(
  organizationId: string,
  clientId: string,
  query: AgencyReportPeriodQuery,
): Promise<ClientReportDto> {
  const client = await findAgencyClientById(pool, organizationId, clientId);
  if (!client) {
    throw new HttpError(404, "Client not found.");
  }
  const period = resolveBoundedPeriod(query);
  const [invoices, expenses] = await Promise.all([
    fetchInvoiceSlice(organizationId, period, clientId),
    fetchExpenseSlice(organizationId, period, clientId),
  ]);
  return {
    clientId,
    clientName: client.name,
    period,
    invoices,
    expenses,
    netInvoicedMinusExpenses: invoices.invoicedAmount - expenses.expenseTotalAmount,
  };
}

export async function getPaymentPendingReportService(
  organizationId: string,
  query: AgencyReportPeriodQuery,
): Promise<PaymentPendingReportDto> {
  const period = resolvePendingDueDatePeriod(query);

  const params: unknown[] = [organizationId];
  let dueFilter = "";
  if (period) {
    params.push(period.fromInclusive, period.toInclusive);
    dueFilter = `AND i.due_date >= $${params.length - 1}::date AND i.due_date <= $${params.length}::date`;
  }

  const rows = await pool.query<{
    id: string;
    invoice_number: string;
    client_id: string;
    client_name: string;
    issue_date: string;
    due_date: string;
    currency: string;
    grand_total: string;
    amount_pending: string;
    status: string;
  }>(
    `
      SELECT
        i.id,
        i.invoice_number,
        i.client_id,
        c.name AS client_name,
        i.issue_date::text AS issue_date,
        i.due_date::text AS due_date,
        i.currency,
        i.grand_total::text,
        i.amount_pending::text,
        i.status::text
      FROM agency_invoices i
      INNER JOIN agency_clients c ON c.id = i.client_id
      WHERE i.organization_id = $1
        AND i.deleted_at IS NULL
        AND i.amount_pending > 0
        AND i.status NOT IN ('paid', 'cancelled')
        ${dueFilter}
      ORDER BY i.due_date ASC, i.invoice_number ASC;
    `,
    params,
  );

  const items: PaymentPendingInvoiceRow[] = rows.rows.map((r) => ({
    invoiceId: r.id,
    invoiceNumber: r.invoice_number,
    clientId: r.client_id,
    clientName: r.client_name,
    issueDate: formatDateYmd(r.issue_date) || String(r.issue_date),
    dueDate: formatDateYmd(r.due_date) || String(r.due_date),
    currency: r.currency,
    grandTotal: Number(r.grand_total),
    amountPending: Number(r.amount_pending),
    status: r.status,
  }));

  const totalPendingAmount = items.reduce((s, i) => s + i.amountPending, 0);

  return {
    period,
    items,
    totalPendingAmount,
    invoiceCount: items.length,
  };
}

export async function getMonthlyReportService(
  organizationId: string,
  month?: string,
): Promise<MonthlyReport> {
  const period = resolveBoundedPeriod(month ? { month } : {});
  const inv = await fetchInvoiceSlice(organizationId, period, null);
  return {
    month: period.label,
    currency: inv.currency,
    invoicedAmount: inv.invoicedAmount,
    receivedAmount: inv.receivedAmount,
    pendingAmount: inv.pendingAmount,
    overdueAmount: inv.overdueAmount,
    overdueCount: inv.overdueCount,
    invoiceCount: inv.invoiceCount,
    paidCount: inv.paidCount,
    topClients: inv.topClients,
    statusBreakdown: inv.statusBreakdown,
  };
}
