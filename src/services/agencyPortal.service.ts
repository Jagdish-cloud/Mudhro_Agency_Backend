import { pool } from "../db/pool.js";
import { findAgencyClientById } from "../repositories/agencyClient.repository.js";
import {
  findAgencyInvoiceByPortalToken,
  findInvoiceItemsByInvoice,
  markInvoicePortalViewed,
} from "../repositories/agencyInvoice.repository.js";
import { listInstallmentsByInvoice } from "../repositories/agencyInstallment.repository.js";
import { listRemindersByInvoice } from "../repositories/agencyReminder.repository.js";
import {
  toAgencyInstallmentDto,
  toAgencyInvoiceItemDto,
  type AgencyInstallmentDto,
  type AgencyInvoiceItemDto,
} from "../types/agencyInvoice.js";
import { HttpError } from "../utils/httpError.js";

export type PortalInvoiceView = {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  status: string;
  subtotal: number;
  discountTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  taxTotal: number;
  grandTotal: number;
  amountReceived: number;
  amountPending: number;
  paymentTerms: string | null;
  notes: string | null;
  organization: {
    name: string;
    address: string;
    email: string;
    phone: string;
    gstNumber: string | null;
  };
  client: {
    name: string;
    contactName: string;
    email: string;
    billingAddress: string;
    gstNumber: string | null;
  };
  items: AgencyInvoiceItemDto[];
  installments: AgencyInstallmentDto[];
  sentAt: string | null;
  viewedAt: string | null;
};

export async function getPortalInvoiceByTokenService(
  token: string,
): Promise<{ invoice: PortalInvoiceView; invoiceId: string; organizationId: string }> {
  const invoice = await findAgencyInvoiceByPortalToken(pool, token);
  if (!invoice) throw new HttpError(404, "Invoice not found.");

  const [items, installments, client, orgRes] = await Promise.all([
    findInvoiceItemsByInvoice(pool, invoice.organization_id, invoice.id),
    listInstallmentsByInvoice(pool, invoice.organization_id, invoice.id),
    findAgencyClientById(pool, invoice.organization_id, invoice.client_id),
    pool.query<{
      name: string;
      address: string;
      company_email: string;
      company_mobile: string;
      gst_number: string | null;
    }>(
      `SELECT name, address, company_email, company_mobile, gst_number
       FROM organizations WHERE id = $1 LIMIT 1;`,
      [invoice.organization_id],
    ),
  ]);

  if (!client) throw new HttpError(404, "Client not found.");
  const org = orgRes.rows[0];
  if (!org) throw new HttpError(404, "Organization not found.");

  return {
    invoiceId: invoice.id,
    organizationId: invoice.organization_id,
    invoice: {
      invoiceNumber: invoice.invoice_number,
      issueDate: invoice.issue_date.toISOString().slice(0, 10),
      dueDate: invoice.due_date.toISOString().slice(0, 10),
      currency: invoice.currency,
      status: invoice.status,
      subtotal: Number(invoice.subtotal),
      discountTotal: Number(invoice.discount_total),
      cgstTotal: Number(invoice.cgst_total),
      sgstTotal: Number(invoice.sgst_total),
      igstTotal: Number(invoice.igst_total),
      taxTotal: Number(invoice.tax_total),
      grandTotal: Number(invoice.grand_total),
      amountReceived: Number(invoice.amount_received),
      amountPending: Number(invoice.amount_pending),
      paymentTerms: invoice.payment_terms,
      notes: invoice.notes,
      organization: {
        name: org.name,
        address: org.address,
        email: org.company_email,
        phone: org.company_mobile,
        gstNumber: org.gst_number,
      },
      client: {
        name: client.name,
        contactName: client.contact_name,
        email: client.email,
        billingAddress: client.billing_address,
        gstNumber: client.gst_number,
      },
      items: items.map(toAgencyInvoiceItemDto),
      installments: installments.map(toAgencyInstallmentDto),
      sentAt: invoice.sent_at ? invoice.sent_at.toISOString() : null,
      viewedAt: invoice.viewed_at ? invoice.viewed_at.toISOString() : null,
    },
  };
}

export async function markPortalInvoiceViewedService(token: string): Promise<void> {
  const invoice = await findAgencyInvoiceByPortalToken(pool, token);
  if (!invoice) throw new HttpError(404, "Invoice not found.");
  await markInvoicePortalViewed(pool, token);
}
