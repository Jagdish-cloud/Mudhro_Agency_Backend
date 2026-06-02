import { z } from "zod";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const dateString = z
  .string()
  .trim()
  .regex(ISO_DATE_REGEX, "Use YYYY-MM-DD date format");

export const expenseLineInputSchema = z.object({
  serviceId: z.string().uuid(),
  quantity: z.coerce.number().positive("Quantity must be > 0"),
  unitPrice: z.coerce.number().min(0, "Unit price must be >= 0"),
});

export const createExpenseSchema = z
  .object({
    vendorId: z.string().uuid(),
    projectId: z
      .union([z.string().uuid(), z.literal(""), z.null()])
      .optional()
      .transform((v) => (v === "" || v === null || v === undefined ? undefined : v)),
    billDate: dateString,
    dueDate: dateString,
    billNumber: z
      .string()
      .trim()
      .max(20)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
    taxPercentage: z.coerce.number().min(0).max(100).optional().default(0),
    totalAmount: z.coerce.number().min(0).optional(),
    additionalNotes: z
      .string()
      .trim()
      .max(5000)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
    items: z.array(expenseLineInputSchema).optional().default([]),
  })
  .refine((data) => data.dueDate >= data.billDate, {
    message: "dueDate must be on or after billDate",
    path: ["dueDate"],
  });

const emptyToUndefined = (v: unknown) =>
  v === "" || v === null || v === undefined ? undefined : v;

export const updateExpenseSchema = z
  .object({
    vendorId: z.string().uuid().optional(),
    projectId: z
      .union([z.string().uuid(), z.literal(""), z.null()])
      .optional()
      .transform((v) => (v === "" ? null : v)),
    billDate: z.preprocess(emptyToUndefined, dateString.optional()),
    dueDate: z.preprocess(emptyToUndefined, dateString.optional()),
    billNumber: z
      .string()
      .trim()
      .max(20)
      .optional()
      .nullable()
      .transform((v) => (v === "" ? null : v)),
    taxPercentage: z.coerce.number().min(0).max(100).optional(),
    totalAmount: z.coerce.number().min(0).optional(),
    additionalNotes: z
      .string()
      .trim()
      .max(5000)
      .optional()
      .nullable(),
    /** When true, deletes the stored receipt blob and clears attachment_file_name. */
    removeAttachment: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update.",
  })
  .refine(
    (data) => {
      if (data.billDate && data.dueDate) return data.dueDate >= data.billDate;
      return true;
    },
    { message: "dueDate must be on or after billDate", path: ["dueDate"] },
  );

export const createExpenseServiceSchema = z.object({
  name: z.string().trim().min(2).max(255),
  description: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  defaultRate: z.coerce.number().min(0).optional().default(0),
});

export const updateExpenseServiceSchema = z
  .object({
    name: z.string().trim().min(2).max(255).optional(),
    description: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .nullable()
      .transform((v) => (v === "" ? null : v)),
    defaultRate: z.coerce.number().min(0).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update.",
  });

export const createExpenseItemBodySchema = z.object({
  serviceId: z.string().uuid(),
  quantity: z.coerce.number().positive("Quantity must be > 0"),
  unitPrice: z.coerce.number().min(0, "Unit price must be >= 0"),
});

export const updateExpenseItemBodySchema = z
  .object({
    serviceId: z.string().uuid().optional(),
    quantity: z.coerce.number().positive().optional(),
    unitPrice: z.coerce.number().min(0).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update.",
  });

/** Optional filters for GET /expenses (reports & drill-down lists). */
export const listExpensesQuerySchema = z
  .object({
    from: dateString.optional(),
    to: dateString.optional(),
    clientId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.from && data.to && data.from > data.to) {
      ctx.addIssue({ code: "custom", message: "from must be on or before to.", path: ["from"] });
    }
  });

export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
