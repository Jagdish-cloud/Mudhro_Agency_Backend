import type {
  ClientReportDto,
  OverallReportDto,
  PaymentPendingInvoiceRow,
  PaymentPendingReportDto,
  ReportPdfExpenseRow,
  ReportPdfInvoiceRow,
  ReportPdfTables,
} from "./agencyReport.service.js";
import { REPORT_PDF_TABLE_LIMIT } from "./agencyReport.service.js";
import { escapeHtml, formatCurrencyForInvoice } from "./invoicePreviewHtml.js";
import { formatDateYmdOrDash } from "../utils/formatDateYmd.js";

function fmtMoney(amount: number, currency: string): string {
  return escapeHtml(formatCurrencyForInvoice(amount, currency));
}

function capLabel(s: string): string {
  const t = s.trim();
  if (!t.length) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function formatPdfDate(value: string | number | Date | null | undefined): string {
  const formatted = formatDateYmdOrDash(value);
  return escapeHtml(formatted === "—" ? "—" : formatted);
}

const REPORT_STYLES = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #fff;
    color: #0a0a0a;
    font-family: 'Noto Sans', ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    font-size: 13px;
    line-height: 1.5;
  }
  .page { max-width: 720px; margin: 0 auto; padding: 8px 0 32px; }
  h1 { margin: 0 0 8px; font-size: 22px; font-weight: 700; }
  .meta { margin: 0 0 4px; color: #737373; font-size: 12px; }
  .period { margin: 0 0 20px; color: #737373; font-size: 11px; }
  .period strong { color: #0a0a0a; }
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 14px;
  }
  .kpi {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: #fafafa;
    padding: 10px 12px;
    min-height: 72px;
  }
  .kpi-label { margin: 0 0 6px; color: #737373; font-size: 11px; }
  .kpi-value { margin: 0; font-size: 17px; font-weight: 700; }
  .kpi-sub { margin: 6px 0 0; color: #737373; font-size: 11px; }
  .card {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: #fafafa;
    padding: 12px 14px;
    margin-bottom: 14px;
  }
  .card-title { margin: 0 0 8px; font-size: 12px; font-weight: 700; }
  .card-value { margin: 0; font-size: 18px; font-weight: 700; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
  .chip-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .chip {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: #fafafa;
    padding: 6px 10px;
    font-size: 11px;
  }
  .row-item {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: #fff;
    padding: 6px 10px;
    margin-top: 8px;
    font-size: 12px;
  }
  .row-item strong { font-weight: 600; }
  .notice {
    border: 1px solid #fbbf24;
    border-radius: 6px;
    background: #fffbeb;
    color: #78350f;
    padding: 12px 14px;
    margin: 18px 0 6px;
    font-size: 12px;
  }
  .notice-title { margin: 0 0 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
  .notice p { margin: 0; line-height: 1.55; }
  .divider { border: 0; border-top: 1px solid #e5e7eb; margin: 22px 0 18px; }
  .report-section { margin-top: 28px; }
  .report-section h2 {
    margin: 0 0 16px;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .table-shell {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
  }
  table.report-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 12px;
  }
  table.report-table thead th {
    background: #f4f4f5;
    color: #737373;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    text-align: left;
    vertical-align: bottom;
    padding: 16px 12px 22px;
    border-bottom: 1px solid #e5e7eb;
  }
  table.report-table thead th.num { text-align: right; }
  table.report-table tbody td {
    padding: 14px 12px;
    border-bottom: 1px solid #f3f4f6;
    vertical-align: top;
    word-wrap: break-word;
  }
  table.report-table tbody tr:first-child td {
    padding-top: 18px;
  }
  table.report-table tbody tr:last-child td { border-bottom: 0; }
  table.report-table tbody tr:nth-child(even) { background: #f9fafb; }
  table.report-table tbody td.num { text-align: right; white-space: nowrap; }
  table.report-table tbody td.muted { color: #737373; font-style: italic; text-align: center; }
  table.report-table tbody td.capitalize { text-transform: capitalize; }
  .hint { margin-top: 8px; color: #737373; font-size: 11px; }
`;

function wrapDocument(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&display=swap" rel="stylesheet" />
  <title>${escapeHtml(title)}</title>
  <style>${REPORT_STYLES}</style>
</head>
<body>${body}</body>
</html>`;
}

function kpiBox(title: string, value: string, sub?: string): string {
  return `<div class="kpi">
    <p class="kpi-label">${escapeHtml(title)}</p>
    <p class="kpi-value">${value}</p>
    ${sub ? `<p class="kpi-sub">${escapeHtml(sub)}</p>` : ""}
  </div>`;
}

function capNoticeHtml(invoiceCount: number, expenseCount: number): string {
  if (invoiceCount < REPORT_PDF_TABLE_LIMIT && expenseCount < REPORT_PDF_TABLE_LIMIT) return "";
  const msg =
    invoiceCount >= REPORT_PDF_TABLE_LIMIT && expenseCount >= REPORT_PDF_TABLE_LIMIT
      ? "Lists are capped at 500 rows each. Narrow the period if something is missing."
      : invoiceCount >= REPORT_PDF_TABLE_LIMIT
        ? "Invoice list capped at 500 rows. Narrow the period if something is missing."
        : "Expense list capped at 500 rows. Narrow the period if something is missing.";
  return `<div class="notice"><p class="notice-title">Note</p><p>${escapeHtml(msg)}</p></div>`;
}

function invoiceTableHtml(rows: ReportPdfInvoiceRow[]): string {
  const body =
    rows.length === 0
      ? `<tr><td colspan="7" class="muted">No invoices match this period.</td></tr>`
      : rows
          .map(
            (row) => `<tr>
        <td>${escapeHtml(row.invoiceNumber)}</td>
        <td>${escapeHtml(row.clientName)}</td>
        <td>${formatPdfDate(row.issueDate)}</td>
        <td>${formatPdfDate(row.dueDate)}</td>
        <td class="capitalize">${escapeHtml(capLabel(row.status))}</td>
        <td class="num">${fmtMoney(row.grandTotal, row.currency)}</td>
        <td class="num">${fmtMoney(row.amountPending, row.currency)}</td>
      </tr>`,
          )
          .join("");
  return `<section class="report-section">
    <h2>Invoices in period</h2>
    <div class="table-shell">
      <table class="report-table">
        <thead>
          <tr>
            <th style="width:14%">Invoice</th>
            <th style="width:22%">Client</th>
            <th style="width:12%">Issue date</th>
            <th style="width:12%">Due date</th>
            <th style="width:10%">Status</th>
            <th class="num" style="width:15%">Grand total</th>
            <th class="num" style="width:15%">Pending</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </section>`;
}

function expenseTableHtml(rows: ReportPdfExpenseRow[], currency: string): string {
  const body =
    rows.length === 0
      ? `<tr><td colspan="5" class="muted">No expenses match this period.</td></tr>`
      : rows
          .map(
            (row) => `<tr>
        <td>${escapeHtml(row.billLabel)}</td>
        <td>${escapeHtml(row.vendorName)}</td>
        <td>${formatPdfDate(row.billDate)}</td>
        <td>${formatPdfDate(row.dueDate)}</td>
        <td class="num">${fmtMoney(row.totalAmount, currency)}</td>
      </tr>`,
          )
          .join("");
  return `<section class="report-section">
    <h2>Expenses in period</h2>
    <div class="table-shell">
      <table class="report-table">
        <thead>
          <tr>
            <th style="width:14%">Bill</th>
            <th style="width:28%">Vendor</th>
            <th style="width:16%">Bill date</th>
            <th style="width:16%">Due date</th>
            <th class="num" style="width:26%">Total</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </section>`;
}

function pendingTableHtml(items: PaymentPendingInvoiceRow[]): string {
  const body =
    items.length === 0
      ? `<tr><td colspan="5" class="muted">No outstanding invoices match this filter.</td></tr>`
      : items
          .map(
            (row) => `<tr>
        <td>${escapeHtml(row.invoiceNumber)}</td>
        <td>${escapeHtml(row.clientName)}</td>
        <td>${formatPdfDate(row.dueDate)}</td>
        <td class="num">${fmtMoney(row.amountPending, row.currency)}</td>
        <td class="capitalize">${escapeHtml(capLabel(row.status))}</td>
      </tr>`,
          )
          .join("");
  return `<section class="report-section">
    <h2>Outstanding invoices</h2>
    <div class="table-shell">
      <table class="report-table">
        <thead>
          <tr>
            <th style="width:14%">Invoice</th>
            <th style="width:30%">Client</th>
            <th style="width:14%">Due</th>
            <th class="num" style="width:18%">Pending</th>
            <th style="width:24%">Status</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </section>`;
}

function statusBreakdownHtml(report: OverallReportDto["invoices"]): string {
  const cur = report.currency;
  const chips = report.statusBreakdown
    .map((s) => `<span class="chip">${escapeHtml(capLabel(s.status))}: ${s.count} · ${fmtMoney(s.amount, cur)}</span>`)
    .join("");
  return `<div class="card">
    <p class="card-title">Invoice status breakdown</p>
    <div class="chip-list">${chips || `<span class="chip">No invoices in period</span>`}</div>
  </div>`;
}

function expenseTopClientsHtml(report: OverallReportDto): string {
  const cur = report.invoices.currency;
  const vendors =
    report.expenses.topVendors.length === 0
      ? `<p class="meta">No expenses in period.</p>`
      : report.expenses.topVendors
          .map(
            (v) => `<div class="row-item"><span>${escapeHtml(v.vendorName)}</span><strong>${fmtMoney(v.totalAmount, cur)}</strong></div>`,
          )
          .join("");
  const clients =
    report.invoices.topClients.length === 0
      ? `<p class="meta">No invoices in period.</p>`
      : report.invoices.topClients
          .map(
            (c) => `<div class="row-item"><strong>${escapeHtml(c.clientName)}</strong><span>${fmtMoney(c.invoicedAmount, cur)}</span></div>`,
          )
          .join("");
  return `<div class="two-col">
    <div class="card">
      <p class="card-title">Expenses</p>
      <p class="meta">${report.expenses.expenseCount} bills · ${fmtMoney(report.expenses.expenseTotalAmount, cur)}</p>
      ${vendors}
    </div>
    <div class="card">
      <p class="card-title">Top clients</p>
      ${clients}
    </div>
  </div>`;
}

function expenseVendorsCardHtml(report: ClientReportDto): string {
  const cur = report.invoices.currency;
  const rows =
    report.expenses.topVendors.length === 0
      ? `<p class="meta">No attributed expenses in period.</p>`
      : report.expenses.topVendors
          .map(
            (v) => `<div class="row-item"><span>${escapeHtml(v.vendorName)}</span><strong>${fmtMoney(v.totalAmount, cur)}</strong></div>`,
          )
          .join("");
  return `<div class="card">
    <p class="card-title">Expense vendors (top)</p>
    ${rows}
  </div>`;
}

function overallKpiHtml(inv: OverallReportDto["invoices"]): string {
  const cur = inv.currency;
  return `<div class="kpi-grid">
    ${kpiBox("Invoiced", fmtMoney(inv.invoicedAmount, cur), `${inv.invoiceCount} invoices`)}
    ${kpiBox("Received", fmtMoney(inv.receivedAmount, cur), `${inv.paidCount} paid`)}
    ${kpiBox("Pending", fmtMoney(inv.pendingAmount, cur))}
    ${kpiBox("Overdue (issued in period)", fmtMoney(inv.overdueAmount, cur), `${inv.overdueCount} invoices`)}
  </div>`;
}

function clientKpiHtml(report: ClientReportDto): string {
  const cur = report.invoices.currency;
  const inv = report.invoices;
  const exp = report.expenses;
  return `<div class="kpi-grid">
    ${kpiBox("Invoiced", fmtMoney(inv.invoicedAmount, cur), `${inv.invoiceCount} invoices`)}
    ${kpiBox("Received", fmtMoney(inv.receivedAmount, cur))}
    ${kpiBox("Attributed expenses", fmtMoney(exp.expenseTotalAmount, cur), `${exp.expenseCount} bills`)}
    ${kpiBox("Net", fmtMoney(report.netInvoicedMinusExpenses, cur))}
  </div>`;
}

function metaBlock(lines: string[]): string {
  return lines.map((l) => `<p class="meta">${escapeHtml(l)}</p>`).join("");
}

export function buildOverallReportHtml(report: OverallReportDto, tables: ReportPdfTables): string {
  const cur = report.invoices.currency;
  const body = `<div class="page">
    <h1>Reports — Overall</h1>
    ${metaBlock([
      `Generated: ${new Date().toISOString().slice(0, 19)}Z`,
      "Invoices use issue date; expenses use bill date.",
    ])}
    <p class="period">Period: <strong>${escapeHtml(report.period.label)}</strong> (${escapeHtml(report.period.fromInclusive)} → ${escapeHtml(report.period.toInclusive)})</p>
    ${overallKpiHtml(report.invoices)}
    <div class="card">
      <p class="card-title">Net (invoiced − expenses)</p>
      <p class="card-value">${fmtMoney(report.netInvoicedMinusExpenses, cur)}</p>
    </div>
    ${expenseTopClientsHtml(report)}
    ${statusBreakdownHtml(report.invoices)}
    <hr class="divider" />
    ${capNoticeHtml(tables.invoiceRows.length, tables.expenseRows.length)}
    ${invoiceTableHtml(tables.invoiceRows)}
    ${expenseTableHtml(tables.expenseRows, cur)}
  </div>`;
  return wrapDocument(`Overall report ${report.period.label}`, body);
}

export function buildClientReportHtml(report: ClientReportDto, tables: ReportPdfTables): string {
  const cur = report.invoices.currency;
  const body = `<div class="page">
    <h1>Reports — ${escapeHtml(report.clientName)}</h1>
    ${metaBlock([
      `Generated: ${new Date().toISOString().slice(0, 19)}Z`,
      "Note: Expenses linked via shared projects include this client.",
    ])}
    <p class="period">${escapeHtml(report.clientName)} · Period: <strong>${escapeHtml(report.period.label)}</strong> (${escapeHtml(report.period.fromInclusive)} → ${escapeHtml(report.period.toInclusive)})</p>
    ${clientKpiHtml(report)}
    ${expenseVendorsCardHtml(report)}
    <hr class="divider" />
    ${capNoticeHtml(tables.invoiceRows.length, tables.expenseRows.length)}
    ${invoiceTableHtml(tables.invoiceRows)}
    ${expenseTableHtml(tables.expenseRows, cur)}
  </div>`;
  return wrapDocument(`Client report ${report.clientName}`, body);
}

export function buildPaymentPendingReportHtml(report: PaymentPendingReportDto): string {
  const primaryCurrency = report.items[0]?.currency ?? "INR";
  const periodSummary =
    report.period != null
      ? `Due dates filter: ${report.period.label} (${report.period.fromInclusive} → ${report.period.toInclusive})`
      : "All outstanding invoices (no due-date filter)";
  const body = `<div class="page">
    <h1>Reports — Payment pending</h1>
    ${metaBlock([
      `Generated: ${new Date().toISOString().slice(0, 19)}Z`,
      periodSummary,
      `${report.invoiceCount} invoices`,
    ])}
    <div class="card">
      <p class="card-title">Total pending (sum)</p>
      <p class="card-value">${fmtMoney(report.totalPendingAmount, primaryCurrency)}</p>
    </div>
    <p class="hint">If invoices use mixed currencies, this total is numeric-only.</p>
    ${pendingTableHtml(report.items)}
  </div>`;
  return wrapDocument("Payment pending report", body);
}
