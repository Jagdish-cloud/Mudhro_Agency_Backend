import { z } from "zod";

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{3}$/;
const IN_MOBILE_REGEX = /^[6-9]\d{9}$/;

const personSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  number: z
    .string()
    .trim()
    .regex(IN_MOBILE_REGEX, "Enter a valid 10-digit Indian mobile number"),
  designation: z.string().trim().min(1, "Designation is required"),
});

const adminSchema = personSchema.extend({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must include an uppercase letter")
    .regex(/[a-z]/, "Password must include a lowercase letter")
    .regex(/[0-9]/, "Password must include a number")
    .regex(/[^A-Za-z0-9]/, "Password must include a special character"),
});

export const organizationRegistrationSchema = z
  .object({
    organization: z.object({
      name: z.string().trim().min(1, "Organization name is required"),
      address: z.string().trim().min(1, "Address is required"),
      gstNumber: z.string().trim().toUpperCase().nullable(),
      isUnregistered: z.boolean(),
      companyPan: z
        .string()
        .trim()
        .toUpperCase()
        .refine((v) => PAN_REGEX.test(v), "Enter a valid PAN"),
      companyMobile: z
        .string()
        .trim()
        .regex(IN_MOBILE_REGEX, "Enter a valid 10-digit Indian mobile number"),
      companyEmail: z.string().trim().toLowerCase().email("Enter a valid email"),
    }),
    contactPersons: z.array(personSchema).min(1, "Add at least one contact person"),
    admins: z.array(adminSchema).min(1, "Add at least one admin"),
  })
  .superRefine((data, ctx) => {
    if (!data.organization.isUnregistered) {
      if (!data.organization.gstNumber) {
        ctx.addIssue({
          code: "custom",
          path: ["organization", "gstNumber"],
          message: "GST number is required for registered organizations",
        });
      } else if (!GST_REGEX.test(data.organization.gstNumber)) {
        ctx.addIssue({
          code: "custom",
          path: ["organization", "gstNumber"],
          message: "Enter a valid GST number",
        });
      }
    } else if (data.organization.gstNumber !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["organization", "gstNumber"],
        message: "GST number must be null for unregistered organizations",
      });
    }

    const emails = new Set<string>();
    for (let i = 0; i < data.admins.length; i += 1) {
      const email = data.admins[i].email;
      if (emails.has(email)) {
        ctx.addIssue({
          code: "custom",
          path: ["admins", i, "email"],
          message: "Admin emails must be unique",
        });
      }
      emails.add(email);
    }
  });

export type OrganizationRegistrationInput = z.infer<typeof organizationRegistrationSchema>;
