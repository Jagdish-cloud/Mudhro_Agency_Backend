import { pool } from "../db/pool.js";
import { findAgencyClientById } from "../repositories/agencyClient.repository.js";
import {
  findAgencyInvoiceById,
  findInvoiceItemsByInvoice,
} from "../repositories/agencyInvoice.repository.js";
import { HttpError } from "../utils/httpError.js";
import {
  buildInvoicePreviewHtml,
  formatInvoicePreviewDate,
  renderInvoiceHtmlToPdf,
  type InvoicePreviewViewModel,
} from "./invoicePreviewHtml.js";

type OrgHeader = {
  name: string;
  address: string;
  company_email: string;
  company_mobile: string;
  gst_number: string | null;
};

async function fetchOrganizationHeader(organizationId: string): Promise<OrgHeader> {
  const result = await pool.query<OrgHeader>(
    `
      SELECT name, address, company_email, company_mobile, gst_number
      FROM organizations
      WHERE id = $1
      LIMIT 1;
    `,
    [organizationId],
  );
  if (!result.rows[0]) throw new HttpError(404, "Organization not found.");
  return result.rows[0];
}

function num(value: string | number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function buildViewModel(args: {
  org: OrgHeader;
  invoice: NonNullable<Awaited<ReturnType<typeof findAgencyInvoiceById>>>;
  client: NonNullable<Awaited<ReturnType<typeof findAgencyClientById>>>;
  items: Awaited<ReturnType<typeof findInvoiceItemsByInvoice>>;
}): InvoicePreviewViewModel {
  const { org, invoice, client, items } = args;
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const hsnList = Array.from(
    new Set(
      sorted
        .map((i) => i.hsn_code?.trim())
        .filter((v): v is string => Boolean(v)),
    ),
  );
  return {
    orgName: org.name.trim() || "Your Organization",
    orgAddress: org.address?.trim() || null,
    orgEmail: org.company_email?.trim() || null,
    orgMobile: org.company_mobile?.trim() || null,
    orgGstNumber: org.gst_number?.trim() || null,
    invoiceNumber: invoice.invoice_number.trim() || "INV-—",
    issueDateLabel: formatInvoicePreviewDate(invoice.issue_date),
    dueDateLabel: formatInvoicePreviewDate(invoice.due_date),
    currency: invoice.currency || "INR",
    billTo: {
      name: client.name,
      contactName: client.contact_name?.trim() || null,
      billingAddress: client.billing_address?.trim() || null,
      email: client.email?.trim() || null,
      gstNumber: client.gst_number?.trim() || null,
    },
    lineItems: sorted.map((it) => ({
      itemName: it.item_name,
      description: it.description,
      hsnCode: (it.hsn_code ?? "").trim(),
      qty: num(it.qty),
      unitPrice: num(it.rate),
      discountPercent: num(it.discount_percent),
      lineTotal: num(it.line_total),
    })),
    subtotal: num(invoice.subtotal),
    discountTotal: num(invoice.discount_total),
    taxTotal: num(invoice.tax_total),
    grandTotal: num(invoice.grand_total),
    cgstTotal: num(invoice.cgst_total),
    sgstTotal: num(invoice.sgst_total),
    igstTotal: num(invoice.igst_total),
    hsnList,
    amountsInclusiveOfTax: Boolean(invoice.amounts_inclusive_of_tax),
    notes: invoice.notes?.trim() ? invoice.notes : null,
  };
}

/**
 * Render an invoice to a PDF buffer. Layout matches the agency app
 * InvoicePreviewCard (HTML → Playwright → PDF).
 */
export async function generateInvoicePdf(
  organizationId: string,
  invoiceId: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const invoice = await findAgencyInvoiceById(pool, organizationId, invoiceId);
  if (!invoice) throw new HttpError(404, "Invoice not found.");

  const [client, items, org] = await Promise.all([
    findAgencyClientById(pool, organizationId, invoice.client_id),
    findInvoiceItemsByInvoice(pool, organizationId, invoiceId),
    fetchOrganizationHeader(organizationId),
  ]);
  if (!client) throw new HttpError(404, "Client not found.");

  const model = buildViewModel({ org, invoice, client, items });
  const html = buildInvoicePreviewHtml(model);

  try {
    const buffer = await renderInvoiceHtmlToPdf(html);
    return { buffer, filename: `${invoice.invoice_number}.pdf` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new HttpError(
      500,
      `Invoice PDF rendering failed (${message}). If this is a fresh environment, run: npx puppeteer browsers install chrome`,
    );
  }
}
