import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(8).max(15).default(10),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  // SMTP (optional; when unset, mail sending is stubbed out for local dev).
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: z
    .union([z.string(), z.boolean()])
    .transform((v) => (typeof v === "boolean" ? v : v === "true" || v === "1"))
    .default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  SMTP_FROM_NAME: z.string().default("Mudhro"),

  // Public-facing base URL used in emails/portal links.
  APP_PUBLIC_URL: z.string().url().default("http://localhost:5173"),

  // Optional explicit overrides for the agreement signing URL base. Resolution
  // order in agreementMail.service.ts is FRONTEND_URL > CLIENT_URL > APP_PUBLIC_URL
  // > request-derived (production) > localhost (development).
  FRONTEND_URL: z.string().url().optional(),
  CLIENT_URL: z.string().url().optional(),

  // Background reminder scheduler toggle.
  ENABLE_SCHEDULER: z
    .union([z.string(), z.boolean()])
    .transform((v) => (typeof v === "boolean" ? v : v === "true" || v === "1"))
    .default(false),

  // Shared secret for POST /api/internal/jobs/reminder-tick (Azure Timer Functions).
  SCHEDULER_SECRET: z.string().min(32).optional(),

  // File-upload storage root (relative to process cwd or absolute).
  UPLOAD_DIR: z.string().default("uploads"),

  // Azure Blob Storage (used for agreement signature PNGs and signed PDFs).
  // When AZURE_STORAGE_CONNECTION_STRING is unset, the blob service throws a
  // clear runtime error at first use rather than at boot.
  AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
  /** Primary container; new uploads use Org_/Project_/… and Org_/Client_/… prefixes. */
  AZURE_BLOB_CONTAINER: z.string().default("agencyuatfiles"),
  /** Legacy flat paths (no Org_ prefix) may still live in these containers. */
  AZURE_BLOB_CONTAINER_SIGNATURES: z.string().default("signatures"),
  AZURE_BLOB_CONTAINER_AGREEMENTS: z.string().default("agreements"),

  // Salt used by the optional Hashids encoder (utils/idCodec.ts). Defaults to
  // JWT_SECRET so the encoder is usable out-of-the-box without extra config.
  HASHIDS_SALT: z.string().optional(),

  // Invoice-number format: INV-{YEAR}-{SEQ}. Pad controls SEQ width.
  INVOICE_NUMBER_PREFIX: z.string().default("INV"),
  INVOICE_NUMBER_PAD: z.coerce.number().int().min(3).max(8).default(5),

  SOCKET_CORS_ORIGIN: z.string().optional(),
  REDIS_URL: z.string().optional(),

  CHAT_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(60),
  CHAT_UPLOAD_MAX_MB: z.coerce.number().int().min(1).max(500).default(25),
  CHAT_SAS_UPLOAD_TTL_MINUTES: z.coerce.number().int().min(1).max(120).default(15),
  ENABLE_CHAT_AUDIT: z
    .union([z.string(), z.boolean()])
    .transform((v) => (typeof v === "boolean" ? v : v === "true" || v === "1"))
    .default(false),
});

export const env = envSchema.parse(process.env);
