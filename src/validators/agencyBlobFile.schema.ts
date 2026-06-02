import { z } from "zod";

export const agencyBlobFileKindSchema = z.enum([
  "service_provider_signature",
  "client_signature",
  "agreement_pdf",
  "other",
]);

/** Project/client attachment stored in agency_project_files (not signatures or agreement PDF). */
export const createAgencyBlobFileSchema = z
  .object({
    projectId: z.string().uuid().optional().nullable(),
    clientId: z.string().uuid().optional().nullable(),
    agreementId: z.string().uuid().optional().nullable(),
    originalFilename: z.string().max(512).optional().nullable(),
    contentType: z.string().max(128).min(1),
    /** Raw base64 (no data: prefix). */
    fileBase64: z.string().min(1),
  })
  .refine((d) => Boolean(d.projectId) || Boolean(d.clientId), {
    message: "Provide projectId and/or clientId to choose a storage folder.",
  });

export const listAgencyBlobFilesQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  fileKind: agencyBlobFileKindSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const patchAgencyBlobFileSchema = z.object({
  originalFilename: z.string().max(512).nullable(),
});

export type CreateAgencyBlobFileInput = z.infer<typeof createAgencyBlobFileSchema>;
export type ListAgencyBlobFilesQuery = z.infer<typeof listAgencyBlobFilesQuerySchema>;
export type PatchAgencyBlobFileInput = z.infer<typeof patchAgencyBlobFileSchema>;
