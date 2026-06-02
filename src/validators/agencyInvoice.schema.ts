import { z } from "zod";

import { ALLOWED_REMINDER_OFFSETS } from "../lib/invoiceReminderSchedule.js";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const dateString = z
  .string()
  .trim()
  .regex(ISO_DATE_REGEX, "Use YYYY-MM-DD date format");

export const invoiceItemSchema = z.object({
  itemName: z.string().trim().min(1, "Item name is required").max(200),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  hsnCode: z
    .string()
    .trim()
    .min(1, "HSN code is required for every item")
    .max(20, "HSN code is too long"),
  qty: z.coerce.number().positive("Quantity must be > 0"),
  rate: z.coerce.number().min(0, "Rate must be >= 0"),
  discountPercent: z.coerce
    .number()
    .min(0)
    .max(100)
    .default(0),
  taxPercent: z.coerce.number().min(0).max(100).default(0),
});

export const installmentInputSchema = z.object({
  sequence: z.coerce.number().int().min(1),
  dueDate: dateString,
  amount: z.coerce.number().positive(),
});

export const reminderOffsetSchema = z.coerce
  .number()
  .int()
  .refine(
    (value): value is (typeof ALLOWED_REMINDER_OFFSETS)[number] =>
      (ALLOWED_REMINDER_OFFSETS as readonly number[]).includes(value),
    { message: "Invalid reminder offset" },
  );

export const reminderOffsetsSchema = z.array(reminderOffsetSchema);

export const reminderInputSchema = z.object({
  type: z.enum(["before_due", "on_due", "overdue", "custom"]),
  offsetDays: z.coerce.number().int().default(0),
  scheduledFor: z.string().trim().min(1),
  channel: z.enum(["email", "in_app"]).default("email"),
});

export const createInvoiceSchema = z
  .object({
    clientId: z.string().uuid(),
    projectId: z.string().uuid().optional(),
    invoiceNumber: z
      .string()
      .trim()
      .max(60)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
    issueDate: dateString,
    dueDate: dateString,
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code")
      .default("INR"),
    status: z
      .enum(["draft", "sent", "viewed", "paid", "partial", "overdue", "cancelled"])
      .default("draft"),
    paymentTerms: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(2000).optional(),
    placeOfSupply: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || /^[0-9]{2}$/.test(v), "State code must be 2 digits"),
    items: z
      .array(invoiceItemSchema)
      .min(1, "At least one line item is required"),
    installments: z.array(installmentInputSchema).optional(),
    reminders: z.array(reminderInputSchema).optional(),
    discountTotal: z.coerce.number().min(0).default(0),
    amountsInclusiveOfTax: z.coerce.boolean().default(false),
    remindersEnabled: z.coerce.boolean().default(true),
    reminderOffsets: reminderOffsetsSchema.optional(),
  })
  .refine((data) => data.dueDate >= data.issueDate, {
    message: "dueDate must be on or after issueDate",
    path: ["dueDate"],
  })
  .refine(
    (data) =>
      !data.remindersEnabled ||
      (data.reminderOffsets !== undefined && data.reminderOffsets.length >= 1),
    {
      message: "Select at least one payment reminder when reminders are enabled.",
      path: ["reminderOffsets"],
    },
  );

export const updateInvoiceSchema = z
  .object({
    clientId: z.string().uuid().optional(),
    projectId: z.union([z.string().uuid(), z.null()]).optional(),
    issueDate: dateString.optional(),
    dueDate: dateString.optional(),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    status: z
      .enum(["draft", "sent", "viewed", "paid", "partial", "overdue", "cancelled"])
      .optional(),
    paymentTerms: z.string().trim().max(500).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    placeOfSupply: z
      .string()
      .trim()
      .optional()
      .nullable()
      .refine(
        (v) => v === undefined || v === null || v === "" || /^[0-9]{2}$/.test(v),
        "State code must be 2 digits",
      ),
    items: z.array(invoiceItemSchema).min(1).optional(),
    installments: z.array(installmentInputSchema).optional(),
    discountTotal: z.coerce.number().min(0).optional(),
    amountsInclusiveOfTax: z.coerce.boolean().optional(),
    remindersEnabled: z.coerce.boolean().optional(),
    reminderOffsets: reminderOffsetsSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update.",
  })
  .refine(
    (data) =>
      data.remindersEnabled !== true ||
      (data.reminderOffsets !== undefined && data.reminderOffsets.length >= 1),
    {
      message: "Select at least one payment reminder when reminders are enabled.",
      path: ["reminderOffsets"],
    },
  );

export const listInvoicesQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  clientId: z.string().uuid().optional(),
  status: z
    .enum(["draft", "sent", "viewed", "paid", "partial", "overdue", "cancelled"])
    .optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  createdBy: z.string().uuid().optional(),
  overdue: z
    .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
    .transform((v) => v === "true" || v === "1")
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(20),
});

export const recordPaymentSchema = z.object({
  amount: z.coerce.number().positive("Amount must be > 0"),
  method: z
    .enum(["cash", "upi", "bank_transfer", "card", "cheque", "other"])
    .default("other"),
  reference: z.string().trim().max(200).optional(),
  receivedAt: z.string().trim().optional(),
  installmentId: z.string().uuid().optional(),
  notes: z.string().trim().max(1000).optional(),
  paymentGatewayFee: z.coerce.number().min(0).optional().default(0),
  tdsDeducted: z.coerce.number().min(0).optional().default(0),
  otherDeduction: z.coerce.number().min(0).optional().default(0),
});

export const createReminderSchema = z.object({
  type: z.enum(["before_due", "on_due", "overdue", "custom"]).default("custom"),
  scheduledFor: z.string().trim().min(1),
  channel: z.enum(["email", "in_app"]).default("email"),
  offsetDays: z.coerce.number().int().default(0),
});

export const sendInvoiceSchema = z.object({
  emailOverride: z.string().trim().email().optional(),
  cc: z.array(z.string().trim().email()).max(10).optional(),
  message: z.string().trim().max(4000).optional(),
});

export const updateInstallmentsSchema = z.object({
  installments: z.array(installmentInputSchema).min(1),
});

export const monthlyReportQuerySchema = z.object({
  month: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, "Use YYYY-MM format")
    .optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type CreateReminderInput = z.infer<typeof createReminderSchema>;
export type SendInvoiceInput = z.infer<typeof sendInvoiceSchema>;
export type UpdateInstallmentsInput = z.infer<typeof updateInstallmentsSchema>;
export type MonthlyReportQuery = z.infer<typeof monthlyReportQuerySchema>;
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;
export type InstallmentInput = z.infer<typeof installmentInputSchema>;
export type ReminderInput = z.infer<typeof reminderInputSchema>;
