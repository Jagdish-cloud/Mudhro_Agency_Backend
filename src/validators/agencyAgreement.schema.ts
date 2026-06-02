import { z } from "zod";

const PAYMENT_STRUCTURES = [
  "50-50",
  "100-upfront",
  "100-completion",
  "milestone-based",
] as const;

const DURATION_UNITS = ["days", "weeks", "months"] as const;

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

const optionalIsoDate = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine(
    (v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v),
    "Date must be in YYYY-MM-DD format",
  );

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null));

const numberLike = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === "number" ? v : Number(v)))
  .refine((v) => Number.isFinite(v) && v >= 0, "Must be a non-negative number");

const deliverableSchema = z.object({
  description: z.string().trim().min(1, "Deliverable cannot be empty").max(500),
});

const milestoneSchema = z.object({
  description: z.string().trim().min(1, "Milestone description is required").max(300),
  amount: numberLike,
  date: optionalIsoDate,
});

const paymentTermsSchema = z.object({
  paymentStructure: z.enum(PAYMENT_STRUCTURES),
  paymentMethod: optionalString(200),
  milestones: z.array(milestoneSchema).max(50).optional().default([]),
});

const signatureImageSchema = z
  .string()
  .min(1, "Signature image is required")
  .refine((v) => v.startsWith("data:image/"), "Signature must be a base64 PNG data URL");

export const createAgreementSchema = z
  .object({
    serviceProviderName: z.string().trim().min(1, "Service provider name is required").max(200),
    agreementDate: isoDate,
    serviceType: z.string().trim().min(1, "Service type is required").max(300),
    startDate: optionalIsoDate,
    endDate: optionalIsoDate,
    duration: z.number().int().min(0).optional().nullable(),
    durationUnit: z.enum(DURATION_UNITS).optional().nullable(),
    numberOfRevisions: z.number().int().min(0).default(0),
    jurisdiction: optionalString(200),
    deliverables: z.array(deliverableSchema).max(100).default([]),
    paymentTerms: paymentTermsSchema,
    serviceProviderSignerName: z
      .string()
      .trim()
      .min(1, "Signer name is required")
      .max(200),
    serviceProviderSignatureImage: signatureImageSchema,
  })
  .refine(
    (data) =>
      !data.startDate ||
      !data.endDate ||
      new Date(data.endDate) >= new Date(data.startDate),
    {
      message: "End date must be on or after start date.",
      path: ["endDate"],
    },
  );

export const updateAgreementSchema = z
  .object({
    serviceProviderName: z.string().trim().min(1).max(200).optional(),
    agreementDate: isoDate.optional(),
    serviceType: z.string().trim().min(1).max(300).optional(),
    startDate: optionalIsoDate,
    endDate: optionalIsoDate,
    duration: z.number().int().min(0).optional().nullable(),
    durationUnit: z.enum(DURATION_UNITS).optional().nullable(),
    numberOfRevisions: z.number().int().min(0).optional(),
    jurisdiction: optionalString(200),
    deliverables: z.array(deliverableSchema).max(100).optional(),
    paymentTerms: paymentTermsSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update.",
  });

export const sendAgreementSchema = z.object({
  clientIds: z.array(z.string().uuid()).min(1, "Select at least one client"),
});

export const portalSignSchema = z.object({
  signerName: z.string().trim().min(1, "Signer name is required").max(200),
  signatureImage: signatureImageSchema,
});

export type CreateAgreementInput = z.infer<typeof createAgreementSchema>;
export type UpdateAgreementInput = z.infer<typeof updateAgreementSchema>;
export type SendAgreementInput = z.infer<typeof sendAgreementSchema>;
export type PortalSignInput = z.infer<typeof portalSignSchema>;
