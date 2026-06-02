export type AgencyInvoiceStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "paid"
  | "partial"
  | "overdue"
  | "cancelled";

export type AgencyInstallmentStatus = "pending" | "paid" | "overdue" | "cancelled";

export type AgencyPaymentMethod =
  | "cash"
  | "upi"
  | "bank_transfer"
  | "card"
  | "cheque"
  | "other";

export type AgencyReminderType = "before_due" | "on_due" | "overdue" | "custom";
export type AgencyReminderChannel = "email" | "in_app";
export type AgencyReminderStatus = "scheduled" | "sent" | "failed" | "cancelled";

export type AgencyInvoiceRow = {
  id: string;
  organization_id: string;
  client_id: string;
  project_id: string | null;
  invoice_number: string;
  issue_date: Date;
  due_date: Date;
  currency: string;
  status: AgencyInvoiceStatus;
  payment_terms: string | null;
  notes: string | null;
  place_of_supply: string | null;
  subtotal: string;
  discount_total: string;
  cgst_total: string;
  sgst_total: string;
  igst_total: string;
  tax_total: string;
  grand_total: string;
  amount_received: string;
  amount_pending: string;
  amounts_inclusive_of_tax: boolean;
  reminders_enabled: boolean;
  reminder_offsets: number[] | null;
  portal_token: string;
  sent_at: Date | null;
  viewed_at: Date | null;
  created_by_org_user_id: string;
  created_by_name: string;
  created_by_email: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type AgencyInvoiceItemRow = {
  id: string;
  invoice_id: string;
  organization_id: string;
  position: number;
  item_name: string;
  description: string | null;
  hsn_code: string;
  qty: string;
  rate: string;
  discount_percent: string;
  tax_percent: string;
  line_subtotal: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  tax_amount: string;
  line_total: string;
};

export type AgencyInstallmentRow = {
  id: string;
  invoice_id: string;
  organization_id: string;
  sequence: number;
  due_date: Date;
  amount: string;
  status: AgencyInstallmentStatus;
  paid_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type AgencyPaymentRow = {
  id: string;
  invoice_id: string;
  organization_id: string;
  installment_id: string | null;
  amount: string;
  payment_gateway_fee: string;
  tds_deducted: string;
  other_deduction: string;
  settlement_reference_amount: string | null;
  method: AgencyPaymentMethod;
  reference: string | null;
  received_at: Date;
  notes: string | null;
  recorded_by_org_user_id: string;
  created_at: Date;
};

export type AgencyReminderRow = {
  id: string;
  invoice_id: string;
  organization_id: string;
  type: AgencyReminderType;
  offset_days: number;
  scheduled_for: Date;
  channel: AgencyReminderChannel;
  status: AgencyReminderStatus;
  sent_at: Date | null;
  error: string | null;
  created_at: Date;
  updated_at: Date;
};

export type AgencyAttachmentRow = {
  id: string;
  invoice_id: string;
  organization_id: string;
  filename: string;
  mime_type: string;
  size_bytes: string;
  storage_path: string;
  uploaded_by_org_user_id: string;
  created_at: Date;
};

export type AgencyInvoiceItemDto = {
  id: string;
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

export type AgencyInstallmentDto = {
  id: string;
  sequence: number;
  dueDate: string;
  amount: number;
  status: AgencyInstallmentStatus;
  paidAt: string | null;
};

export type AgencyPaymentDto = {
  id: string;
  invoiceId: string;
  installmentId: string | null;
  amount: number;
  paymentGatewayFee: number;
  tdsDeducted: number;
  otherDeduction: number;
  settlementReferenceAmount: number | null;
  method: AgencyPaymentMethod;
  reference: string | null;
  receivedAt: string;
  notes: string | null;
  recordedByOrgUserId: string;
  createdAt: string;
};

export type AgencyReminderDto = {
  id: string;
  invoiceId: string;
  type: AgencyReminderType;
  offsetDays: number;
  scheduledFor: string;
  channel: AgencyReminderChannel;
  status: AgencyReminderStatus;
  sentAt: string | null;
  error: string | null;
};

export type AgencyAttachmentDto = {
  id: string;
  invoiceId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByOrgUserId: string;
  createdAt: string;
};

export type AgencyInvoiceDto = {
  id: string;
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
  portalToken: string;
  sentAt: string | null;
  viewedAt: string | null;
  createdByOrgUserId: string;
  createdByName: string;
  createdByEmail: string;
  createdAt: string;
  updatedAt: string;
  items: AgencyInvoiceItemDto[];
  installments: AgencyInstallmentDto[];
  reminders: AgencyReminderDto[];
};

function num(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function dateOnly(value: Date): string {
  // pg returns DATE as a JS Date in local tz; we want a plain YYYY-MM-DD.
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function toAgencyInvoiceItemDto(row: AgencyInvoiceItemRow): AgencyInvoiceItemDto {
  return {
    id: row.id,
    position: row.position,
    itemName: row.item_name,
    description: row.description,
    hsnCode: row.hsn_code,
    qty: num(row.qty),
    rate: num(row.rate),
    discountPercent: num(row.discount_percent),
    taxPercent: num(row.tax_percent),
    lineSubtotal: num(row.line_subtotal),
    cgstAmount: num(row.cgst_amount),
    sgstAmount: num(row.sgst_amount),
    igstAmount: num(row.igst_amount),
    taxAmount: num(row.tax_amount),
    lineTotal: num(row.line_total),
  };
}

export function toAgencyInstallmentDto(row: AgencyInstallmentRow): AgencyInstallmentDto {
  return {
    id: row.id,
    sequence: row.sequence,
    dueDate: dateOnly(row.due_date),
    amount: num(row.amount),
    status: row.status,
    paidAt: row.paid_at ? row.paid_at.toISOString() : null,
  };
}

export function toAgencyPaymentDto(row: AgencyPaymentRow): AgencyPaymentDto {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    installmentId: row.installment_id,
    amount: num(row.amount),
    paymentGatewayFee: num(row.payment_gateway_fee),
    tdsDeducted: num(row.tds_deducted),
    otherDeduction: num(row.other_deduction),
    settlementReferenceAmount:
      row.settlement_reference_amount === null || row.settlement_reference_amount === undefined
        ? null
        : num(row.settlement_reference_amount),
    method: row.method,
    reference: row.reference,
    receivedAt: row.received_at.toISOString(),
    notes: row.notes,
    recordedByOrgUserId: row.recorded_by_org_user_id,
    createdAt: row.created_at.toISOString(),
  };
}

export function toAgencyReminderDto(row: AgencyReminderRow): AgencyReminderDto {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    type: row.type,
    offsetDays: row.offset_days,
    scheduledFor: row.scheduled_for.toISOString(),
    channel: row.channel,
    status: row.status,
    sentAt: row.sent_at ? row.sent_at.toISOString() : null,
    error: row.error,
  };
}

export function toAgencyAttachmentDto(row: AgencyAttachmentRow): AgencyAttachmentDto {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    uploadedByOrgUserId: row.uploaded_by_org_user_id,
    createdAt: row.created_at.toISOString(),
  };
}

export type AgencyInvoiceAggregate = {
  invoice: AgencyInvoiceRow;
  items: AgencyInvoiceItemRow[];
  installments: AgencyInstallmentRow[];
  reminders: AgencyReminderRow[];
};

export function toAgencyInvoiceDto(aggregate: AgencyInvoiceAggregate): AgencyInvoiceDto {
  const row = aggregate.invoice;
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    projectId: row.project_id,
    invoiceNumber: row.invoice_number,
    issueDate: dateOnly(row.issue_date),
    dueDate: dateOnly(row.due_date),
    currency: row.currency,
    status: row.status,
    paymentTerms: row.payment_terms,
    notes: row.notes,
    placeOfSupply: row.place_of_supply,
    subtotal: num(row.subtotal),
    discountTotal: num(row.discount_total),
    cgstTotal: num(row.cgst_total),
    sgstTotal: num(row.sgst_total),
    igstTotal: num(row.igst_total),
    taxTotal: num(row.tax_total),
    grandTotal: num(row.grand_total),
    amountReceived: num(row.amount_received),
    amountPending: num(row.amount_pending),
    amountsInclusiveOfTax: Boolean(row.amounts_inclusive_of_tax),
    remindersEnabled: Boolean(row.reminders_enabled),
    reminderOffsets: row.reminder_offsets?.length ? [...row.reminder_offsets].sort((a, b) => a - b) : null,
    portalToken: row.portal_token,
    sentAt: row.sent_at ? row.sent_at.toISOString() : null,
    viewedAt: row.viewed_at ? row.viewed_at.toISOString() : null,
    createdByOrgUserId: row.created_by_org_user_id,
    createdByName: row.created_by_name,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    items: aggregate.items
      .sort((a, b) => a.position - b.position)
      .map(toAgencyInvoiceItemDto),
    installments: aggregate.installments
      .sort((a, b) => a.sequence - b.sequence)
      .map(toAgencyInstallmentDto),
    reminders: aggregate.reminders
      .sort((a, b) => a.scheduled_for.getTime() - b.scheduled_for.getTime())
      .map(toAgencyReminderDto),
  };
}

export type AgencyNotificationRow = {
  id: string;
  organization_id: string;
  user_id: string | null;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  related_entity_type: string | null;
  related_entity_id: string | null;
  is_read: boolean;
  created_at: Date;
};

export type AgencyNotificationDto = {
  id: string;
  organizationId: string;
  userId: string | null;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  isRead: boolean;
  createdAt: string;
};

export function toAgencyNotificationDto(
  row: AgencyNotificationRow,
): AgencyNotificationDto {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    title: row.title,
    message: row.message,
    severity: row.severity,
    relatedEntityType: row.related_entity_type,
    relatedEntityId: row.related_entity_id,
    isRead: row.is_read,
    createdAt: row.created_at.toISOString(),
  };
}
