import { z } from "zod";

const PROJECT_STATUSES = ["active", "completed", "on-hold", "cancelled"] as const;

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

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(1, "Project name is required").max(200),
    description: optionalString(2000),
    startDate: optionalIsoDate,
    endDate: optionalIsoDate,
    status: z.enum(PROJECT_STATUSES).optional(),
    budget: z
      .union([z.number(), z.string()])
      .optional()
      .nullable()
      .transform((v) => {
        if (v === null || v === undefined || v === "") return null;
        const num = typeof v === "number" ? v : Number(v);
        return Number.isFinite(num) ? num : null;
      })
      .refine(
        (v) => v === null || (typeof v === "number" && v >= 0),
        "Budget must be a non-negative number",
      ),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code")
      .optional(),
    clientIds: z.array(z.string().uuid()).max(100).optional(),
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

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: optionalString(2000),
    startDate: optionalIsoDate,
    endDate: optionalIsoDate,
    status: z.enum(PROJECT_STATUSES).optional(),
    budget: z
      .union([z.number(), z.string()])
      .optional()
      .nullable()
      .transform((v) => {
        if (v === null || v === undefined || v === "") return null;
        const num = typeof v === "number" ? v : Number(v);
        return Number.isFinite(num) ? num : null;
      })
      .refine(
        (v) => v === null || v === undefined || (typeof v === "number" && v >= 0),
        "Budget must be a non-negative number",
      ),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/)
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update.",
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

export const assignClientsSchema = z.object({
  clientIds: z.array(z.string().uuid()).max(200),
});

export const listProjectsQuerySchema = z.object({
  status: z.enum(PROJECT_STATUSES).optional(),
  search: z.string().trim().max(200).optional(),
});

export { isoDate as projectIsoDate };

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type AssignClientsInput = z.infer<typeof assignClientsSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
