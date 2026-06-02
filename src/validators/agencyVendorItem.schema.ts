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

const qtyNumber = z.coerce.number().positive("Quantity must be > 0");
const nonNegRate = z.coerce.number().min(0);

export const createVendorItemSchema = z.object({
  itemName: nonEmpty(200, "Item name"),
  description: optionalText(2000),
  defaultQuantity: qtyNumber.default(1),
  defaultRate: nonNegRate.default(0),
});

export const updateVendorItemSchema = z
  .object({
    itemName: nonEmpty(200, "Item name").optional(),
    description: optionalText(2000),
    defaultQuantity: qtyNumber.optional(),
    defaultRate: nonNegRate.optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "Provide at least one field to update.",
  });

export const listVendorItemsQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
});

export type CreateVendorItemInput = z.infer<typeof createVendorItemSchema>;
export type UpdateVendorItemInput = z.infer<typeof updateVendorItemSchema>;
export type ListVendorItemsQuery = z.infer<typeof listVendorItemsQuerySchema>;
