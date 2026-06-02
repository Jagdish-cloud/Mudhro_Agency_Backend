import { promises as fs } from "fs";
import path from "path";

import { env } from "../config/env.js";
import { HttpError } from "./httpError.js";

export function getUploadRoot(): string {
  return path.isAbsolute(env.UPLOAD_DIR)
    ? env.UPLOAD_DIR
    : path.resolve(process.cwd(), env.UPLOAD_DIR);
}

export function getInvoiceAttachmentDir(
  organizationId: string,
  invoiceId: string,
): string {
  return path.join(getUploadRoot(), "orgs", organizationId, "invoices", invoiceId);
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Resolve a relative storage path against the upload root and refuse any
 * location that escapes it (prevents directory traversal).
 */
export function resolveStoragePath(relative: string): string {
  const root = getUploadRoot();
  const resolved = path.resolve(root, relative);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new HttpError(400, "Invalid storage path.");
  }
  return resolved;
}

export function toStorageRelative(absolute: string): string {
  return path.relative(getUploadRoot(), absolute).split(path.sep).join("/");
}

export async function removeFileQuiet(absolute: string): Promise<void> {
  try {
    await fs.unlink(absolute);
  } catch {
    /* ignore */
  }
}

export const ALLOWED_ATTACHMENT_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);

export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
