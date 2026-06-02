import { z } from "zod";

const IN_MOBILE_REGEX = /^[6-9]\d{9}$/;

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[0-9]/, "Password must include a number")
  .regex(/[^A-Za-z0-9]/, "Password must include a special character");

export const updateSelfProfileSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120, "Name is too long").optional(),
    number: z
      .string()
      .trim()
      .regex(IN_MOBILE_REGEX, "Enter a valid 10-digit Indian mobile number")
      .optional(),
    designation: z
      .string()
      .trim()
      .min(1, "Designation is required")
      .max(120, "Designation is too long")
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update.",
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .strict()
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ["newPassword"],
    message: "New password must be different from current password",
  });

export type UpdateSelfProfileInput = z.infer<typeof updateSelfProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
