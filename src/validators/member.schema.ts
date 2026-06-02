import { z } from "zod";

const IN_MOBILE_REGEX = /^[6-9]\d{9}$/;

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[0-9]/, "Password must include a number")
  .regex(/[^A-Za-z0-9]/, "Password must include a special character");

const basePersonSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  number: z
    .string()
    .trim()
    .regex(IN_MOBILE_REGEX, "Enter a valid 10-digit Indian mobile number"),
  designation: z
    .string()
    .trim()
    .min(1, "Designation is required")
    .max(120, "Designation is too long"),
  password: passwordSchema,
});

export const createAdminSchema = basePersonSchema;
export const createMemberSchema = basePersonSchema;

export const updateMemberSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    number: z.string().trim().regex(IN_MOBILE_REGEX, "Enter a valid 10-digit Indian mobile number").optional(),
    designation: z.string().trim().min(1).max(120).optional(),
    status: z.enum(["active", "inactive"]).optional(),
    role: z.union([z.literal(1), z.literal(2)]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update.",
  });

export const listMembersQuerySchema = z.object({
  role: z
    .union([z.literal("1"), z.literal("2"), z.literal(1), z.literal(2)])
    .transform((v) => (typeof v === "string" ? (Number(v) as 1 | 2) : v))
    .optional(),
  status: z.enum(["active", "inactive"]).optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateAdminInput = z.infer<typeof createAdminSchema>;
export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>;
