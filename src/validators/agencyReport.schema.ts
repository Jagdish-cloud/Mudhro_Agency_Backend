import { z } from "zod";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const isoDate = z.string().trim().regex(ISO_DATE_REGEX, "Use YYYY-MM-DD date format");

export const agencyReportPeriodQuerySchema = z
  .object({
    month: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}$/, "Use YYYY-MM format")
      .optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.from && data.to && data.from > data.to) {
      ctx.addIssue({ code: "custom", message: "from must be on or before to.", path: ["from"] });
    }
  });

export type AgencyReportPeriodQuery = z.infer<typeof agencyReportPeriodQuerySchema>;

export function hasAnyPeriodParam(q: AgencyReportPeriodQuery): boolean {
  return q.month != null || q.year != null || q.from != null || q.to != null;
}

export const agencyClientReportParamsSchema = z.object({
  clientId: z.string().uuid(),
});
