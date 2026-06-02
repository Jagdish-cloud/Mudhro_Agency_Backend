import { renderHtmlToPdf } from "../utils/renderHtmlToPdf.js";

const LOCALE_BY_CURRENCY: Record<string, string> = {
  INR: "en-IN",
  USD: "en-US",
  EUR: "en-IE",
  GBP: "en-GB",
  AED: "en-AE",
  SGD: "en-SG",
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Matches InvoicePreviewCard date formatting (en-IN, short month). */
export function formatInvoicePreviewDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const iso = `${y}-${m}-${day}`;
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Matches frontend `formatCurrency` in Mudhro Agency Frontend. */
export function formatCurrencyForInvoice(amount: number | string, code = "INR"): string {
  const upper = (code || "INR").toUpperCase();
  const value = typeof amount === "string" ? Number(amount) : (amount ?? 0);
  const numeric = Number.isFinite(value) ? value : 0;
  const locale = LOCALE_BY_CURRENCY[upper] ?? "en-IN";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: upper.length === 3 && upper.match(/^[A-Z]{3}$/) ? upper : "INR",
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${numeric.toFixed(2)} ${upper}`;
  }
}

function formatLineDiscPercentForInvoice(n: number): string {
  if (!Number.isFinite(n)) return "0%";
  if (Number.isInteger(n)) return `${n}%`;
  const rounded = Math.round(n * 100) / 100;
  return `${rounded}%`;
}

export type InvoicePreviewLineItem = {
  itemName: string;
  description: string | null;
  hsnCode: string;
  qty: number;
  unitPrice: number;
  discountPercent: number;
  lineTotal: number;
};

export type InvoicePreviewViewModel = {
  orgName: string;
  orgAddress: string | null;
  orgEmail: string | null;
  orgMobile: string | null;
  orgGstNumber: string | null;
  invoiceNumber: string;
  issueDateLabel: string;
  dueDateLabel: string;
  currency: string;
  /** When null, render “No client selected” like the empty preview state. */
  billTo: {
    name: string;
    contactName: string | null;
    billingAddress: string | null;
    email: string | null;
    gstNumber: string | null;
  } | null;
  lineItems: InvoicePreviewLineItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  hsnList: string[];
  amountsInclusiveOfTax: boolean;
  notes: string | null;
};

function billToSection(model: InvoicePreviewViewModel): string {
  const muted = "color:#64748b;font-size:12px;";
  const fg = "color:#0f172a;";
  if (!model.billTo) {
    return `<p style="margin-top:4px;${muted}font-style:italic;">No client selected</p>`;
  }
  const c = model.billTo;
  const parts: string[] = [`<p style="font-weight:600;${fg}">${escapeHtml(c.name)}</p>`];
  if (c.contactName?.trim()) {
    parts.push(`<p style="${muted}margin-top:4px;">${escapeHtml(c.contactName)}</p>`);
  }
  if (c.billingAddress?.trim()) {
    parts.push(
      `<p style="${muted}margin-top:4px;white-space:pre-wrap;">${escapeHtml(c.billingAddress)}</p>`,
    );
  }
  if (c.email?.trim()) {
    parts.push(`<p style="${muted}margin-top:4px;">${escapeHtml(c.email)}</p>`);
  }
  if (c.gstNumber?.trim()) {
    parts.push(`<p style="${muted}margin-top:4px;">GSTIN: ${escapeHtml(c.gstNumber)}</p>`);
  }
  return `<div style="margin-top:4px;">${parts.join("")}</div>`;
}

function lineItemsTable(model: InvoicePreviewViewModel): string {
  const currency = model.currency;
  const th =
    "text-align:left;padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;";
  const thRight = th.replace("text-align:left", "text-align:right");
  if (model.lineItems.length === 0) {
    return `<table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;">
      <thead><tr>
        <th style="${th}width:28%;">Description</th>
        <th style="${th}width:12%;">HSN/SAC</th>
        <th style="${thRight}width:10%;">Qty</th>
        <th style="${thRight}width:18%;">Unit Price</th>
        <th style="${thRight}width:10%;">Disc %</th>
        <th style="${thRight}width:22%;">Amount</th>
      </tr></thead>
      <tbody><tr><td colspan="6" style="padding:12px 0;color:#64748b;font-style:italic;">Add a line item to preview the invoice.</td></tr></tbody>
    </table>`;
  }
  const rows = model.lineItems
    .map((it) => {
      const name = it.itemName.trim() || "Item";
      const hsnRaw = it.hsnCode?.trim() ?? "";
      const hsnCell = hsnRaw ? escapeHtml(hsnRaw) : "—";
      const desc = it.description?.trim()
        ? `<p style="margin:4px 0 0;color:#64748b;font-size:12px;white-space:pre-wrap;">${escapeHtml(it.description)}</p>`
        : "";
      const discLabel = escapeHtml(formatLineDiscPercentForInvoice(it.discountPercent));
      return `<tr>
        <td style="padding:8px 0;border-bottom:1px solid rgba(226,232,240,0.6);vertical-align:top;width:28%;">
          <p style="margin:0;font-weight:600;color:#0f172a;">${escapeHtml(name)}</p>${desc}
        </td>
        <td style="padding:8px 0;border-bottom:1px solid rgba(226,232,240,0.6);vertical-align:top;color:#64748b;">${hsnCell}</td>
        <td style="padding:8px 0;border-bottom:1px solid rgba(226,232,240,0.6);text-align:right;vertical-align:top;">${it.qty}</td>
        <td style="padding:8px 0;border-bottom:1px solid rgba(226,232,240,0.6);text-align:right;vertical-align:top;">${escapeHtml(formatCurrencyForInvoice(it.unitPrice, currency))}</td>
        <td style="padding:8px 0;border-bottom:1px solid rgba(226,232,240,0.6);text-align:right;vertical-align:top;color:#64748b;">${discLabel}</td>
        <td style="padding:8px 0;border-bottom:1px solid rgba(226,232,240,0.6);text-align:right;vertical-align:top;">${escapeHtml(formatCurrencyForInvoice(it.lineTotal, currency))}</td>
      </tr>`;
    })
    .join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;">
    <thead><tr>
      <th style="${th}width:28%;">Description</th>
      <th style="${th}width:12%;">HSN/SAC</th>
      <th style="${thRight}width:10%;">Qty</th>
      <th style="${thRight}width:18%;">Unit Price</th>
      <th style="${thRight}width:10%;">Disc %</th>
      <th style="${thRight}width:22%;">Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function totalsBlock(model: InvoicePreviewViewModel): string {
  const currency = model.currency;
  const row = (label: string, value: string, muted = true) =>
    `<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px;">
      <span style="color:${muted ? "#64748b" : "#0f172a"};">${label}</span>
      <span style="color:#0f172a;">${value}</span>
    </div>`;
  const parts: string[] = [
    row("Subtotal", escapeHtml(formatCurrencyForInvoice(model.subtotal, currency))),
  ];
  if (model.discountTotal > 0) {
    parts.push(
      row(
        "Discount",
        `-${escapeHtml(formatCurrencyForInvoice(model.discountTotal, currency))}`,
      ),
    );
  }
  parts.push(row("GST Total", escapeHtml(formatCurrencyForInvoice(model.taxTotal, currency))));
  parts.push(
    `<div style="display:flex;justify-content:space-between;padding-top:8px;margin-top:4px;border-top:1px solid #e2e8f0;font-size:14px;font-weight:600;color:#0f172a;">
      <span>Total</span>
      <span>${escapeHtml(formatCurrencyForInvoice(model.grandTotal, currency))}</span>
    </div>`,
  );
  return `<div style="margin-left:auto;max-width:320px;width:100%;">${parts.join("")}</div>`;
}

function taxDetailsSection(model: InvoicePreviewViewModel): string {
  const currency = model.currency;
  const gstin = model.orgGstNumber?.trim() || "—";
  const hsnPart =
    model.hsnList.length > 0
      ? `&nbsp;&nbsp;|&nbsp;&nbsp;SAC/HSN: ${escapeHtml(model.hsnList.join(", "))}`
      : "";
  const cgstSgst =
    model.cgstTotal > 0 || model.sgstTotal > 0
      ? `<p style="margin:6px 0 0;">
    CGST: ${escapeHtml(formatCurrencyForInvoice(model.cgstTotal, currency))}
    &nbsp;&nbsp;|&nbsp;&nbsp;
    SGST: ${escapeHtml(formatCurrencyForInvoice(model.sgstTotal, currency))}
  </p>`
      : "";
  const igst =
    model.igstTotal > 0
      ? `<p style="margin:6px 0 0;">IGST: ${escapeHtml(formatCurrencyForInvoice(model.igstTotal, currency))}</p>`
      : "";
  const inclusive = model.amountsInclusiveOfTax
    ? `<p style="margin:6px 0 0;font-style:italic;">Amounts entered are inclusive of GST.</p>`
    : "";
  return `<section style="border:1px dashed rgba(226,232,240,0.85);border-radius:6px;padding:12px;background:rgba(248,250,252,0.9);color:#64748b;font-size:11px;">
    <p style="margin:0;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Tax Details</p>
    <p style="margin:6px 0 0;">GSTIN: ${escapeHtml(gstin)}${hsnPart}</p>
    ${cgstSgst}
    ${igst}
    ${inclusive}
  </section>`;
}

/**
 * Full HTML document matching the structure of InvoicePreviewCard (Tailwind/shadcn layout approximated with inline CSS).
 */
export function buildInvoicePreviewHtml(model: InvoicePreviewViewModel): string {
  const muted = "color:#64748b;font-size:12px;";
  const orgBits: string[] = [];
  if (model.orgAddress?.trim()) {
    orgBits.push(
      `<p style="margin:8px 0 0;max-width:26ch;white-space:pre-line;${muted}">${escapeHtml(model.orgAddress)}</p>`,
    );
  }
  if (model.orgEmail?.trim()) {
    orgBits.push(`<p style="margin:4px 0 0;${muted}">${escapeHtml(model.orgEmail)}</p>`);
  }
  if (model.orgMobile?.trim()) {
    orgBits.push(`<p style="margin:4px 0 0;${muted}">${escapeHtml(model.orgMobile)}</p>`);
  }
  const notesSection =
    model.notes?.trim() ?
      `<section style="border-top:1px solid #e2e8f0;padding-top:12px;margin-top:24px;font-size:12px;color:#64748b;">
        <p style="margin:0;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Notes</p>
        <p style="margin:8px 0 0;white-space:pre-wrap;">${escapeHtml(model.notes.trim())}</p>
      </section>`
    : "";

  const inner = `
  <div style="max-width:720px;margin:0 auto;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,0.05);border-radius:8px;padding:24px;font-family:'Noto Sans',ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.5;">
    <header style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
      <div>
        <p style="margin:0;font-size:16px;font-weight:600;color:#0f172a;">${escapeHtml(model.orgName)}</p>
        ${orgBits.join("")}
      </div>
      <div style="text-align:right;">
        <p style="margin:0;font-size:20px;font-weight:600;text-transform:uppercase;letter-spacing:0.18em;color:#0f172a;">Invoice</p>
        <p style="margin:8px 0 0;${muted}"><span style="font-weight:600;color:#0f172a;">${escapeHtml(model.invoiceNumber)}</span></p>
        <p style="margin:4px 0 0;${muted}">Issue: ${escapeHtml(model.issueDateLabel)}</p>
        <p style="margin:4px 0 0;${muted}">Due: ${escapeHtml(model.dueDateLabel)}</p>
      </div>
    </header>
    <section style="margin-top:24px;">
      <p style="margin:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;">Bill To</p>
      ${billToSection(model)}
    </section>
    <section style="margin-top:24px;">
      ${lineItemsTable(model)}
    </section>
    <section style="margin-top:24px;">
      ${totalsBlock(model)}
    </section>
    <section style="margin-top:24px;">
      ${taxDetailsSection(model)}
    </section>
    ${notesSection}
    <footer style="border-top:1px solid #e2e8f0;padding-top:12px;margin-top:24px;text-align:center;font-size:12px;color:#64748b;">
      Thank you for your business.
    </footer>
  </div>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&display=swap" rel="stylesheet" /><title>Invoice ${escapeHtml(model.invoiceNumber)}</title></head><body style="margin:0;background:#fff;">${inner}</body></html>`;
}

export async function renderInvoiceHtmlToPdf(html: string): Promise<Buffer> {
  return renderHtmlToPdf(html);
}
