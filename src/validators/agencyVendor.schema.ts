import { z } from "zod";

const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{3}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const PHONE_REGEX = /^[+0-9 \-()]{0,20}$/;

const stringOrEmpty = (max: number, msg: string) =>
  z.string().trim().max(max, msg).default("");

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));

export const createVendorSchema = z.object({
  name: z.string().trim().min(1, "Vendor name is required").max(200),
  contactName: stringOrEmpty(200, "Contact name is too long"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .default("")
    .refine(
      (v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "Enter a valid email",
    ),
  phone: z
    .string()
    .trim()
    .max(20)
    .default("")
    .refine((v) => v === "" || PHONE_REGEX.test(v), "Enter a valid phone"),
  billingAddress: stringOrEmpty(1000, "Billing address is too long"),
  gstNumber: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .refine((v) => !v || GST_REGEX.test(v), "Invalid GST format")
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  panNumber: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .refine((v) => !v || PAN_REGEX.test(v), "Invalid PAN format")
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  stateCode: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^[0-9]{2}$/.test(v), "State code must be 2 digits")
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  status: z.enum(["active", "inactive", "archived"]).default("active"),
  notes: optionalString(2000),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
});

export const updateVendorSchema = createVendorSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update.",
  });

export const listVendorsQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(["active", "inactive", "archived"]).optional(),
  tag: z.string().trim().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(20),
});

export type CreateVendorInput = z.infer<typeof createVendorSchema>;
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;
export type ListVendorsQuery = z.infer<typeof listVendorsQuerySchema>;
