import { z } from "zod";

const nonEmpty = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required`).max(max);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));

const nonNegNumber = (max: number) =>
  z.coerce.number().min(0).max(max);

const percentNumber = z.coerce.number().min(0).max(100);

export const createClientItemSchema = z.object({
  itemName: nonEmpty(200, "Item name"),
  description: optionalText(2000),
  hsnCode: nonEmpty(20, "HSN/SAC code"),
  defaultRate: nonNegNumber(99999999.99).default(0),
  defaultTaxPercent: percentNumber.default(0),
  defaultDiscountPercent: percentNumber.default(0),
  unit: optionalText(50),
});

// Update schema is defined explicitly (not via `.partial()`) because the
// create schema applies numeric defaults, which would otherwise make every
// parsed object non-empty and defeat the "at least one field" guard.
export const updateClientItemSchema = z
  .object({
    itemName: nonEmpty(200, "Item name").optional(),
    description: optionalText(2000),
    hsnCode: nonEmpty(20, "HSN/SAC code").optional(),
    defaultRate: nonNegNumber(99999999.99).optional(),
    defaultTaxPercent: percentNumber.optional(),
    defaultDiscountPercent: percentNumber.optional(),
    unit: optionalText(50),
  })
  .refine(
    (data) =>
      Object.values(data).some((v) => v !== undefined),
    { message: "Provide at least one field to update." },
  );

// Body sent by the Invoice Builder's per-row "Save to catalog" button. It
// intentionally mirrors the invoice line item shape so the frontend can POST
// the row directly.
export const saveInvoiceRowToCatalogSchema = z.object({
  itemName: nonEmpty(200, "Item name"),
  description: optionalText(2000),
  hsnCode: nonEmpty(20, "HSN/SAC code"),
  rate: nonNegNumber(99999999.99),
  taxPercent: percentNumber.default(0),
  discountPercent: percentNumber.default(0),
  unit: optionalText(50),
});

export const listClientItemsQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
});

export type CreateClientItemInput = z.infer<typeof createClientItemSchema>;
export type UpdateClientItemInput = z.infer<typeof updateClientItemSchema>;
export type SaveInvoiceRowToCatalogInput = z.infer<
  typeof saveInvoiceRowToCatalogSchema
>;
export type ListClientItemsQuery = z.infer<typeof listClientItemsQuerySchema>;
