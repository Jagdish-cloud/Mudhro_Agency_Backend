import { promises as fs } from "fs";
import path from "path";

import { pool } from "../db/pool.js";
import {
  deleteAttachment as deleteAttachmentRow,
  findAttachmentById,
  insertAttachment,
  listAttachmentsByInvoice,
} from "../repositories/agencyAttachment.repository.js";
import { findAgencyInvoiceById } from "../repositories/agencyInvoice.repository.js";
import {
  toAgencyAttachmentDto,
  type AgencyAttachmentDto,
} from "../types/agencyInvoice.js";
import {
  ALLOWED_ATTACHMENT_MIME,
  MAX_ATTACHMENT_SIZE_BYTES,
  ensureDir,
  getInvoiceAttachmentDir,
  removeFileQuiet,
  resolveStoragePath,
  toStorageRelative,
} from "../utils/files.js";
import { HttpError } from "../utils/httpError.js";

export type UploadAttachmentParams = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export async function uploadInvoiceAttachmentService(
  organizationId: string,
  uploaderUserId: string,
  invoiceId: string,
  file: UploadAttachmentParams,
): Promise<AgencyAttachmentDto> {
  const invoice = await findAgencyInvoiceById(pool, organizationId, invoiceId);
  if (!invoice) throw new HttpError(404, "Invoice not found.");

  if (!ALLOWED_ATTACHMENT_MIME.has(file.mimetype)) {
    throw new HttpError(415, `Unsupported file type: ${file.mimetype}`);
  }
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new HttpError(413, "Attachment exceeds 10 MB limit.");
  }

  const dir = getInvoiceAttachmentDir(organizationId, invoiceId);
  await ensureDir(dir);

  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}-${safeName}`;
  const absPath = path.join(dir, unique);
  await fs.writeFile(absPath, file.buffer);

  const relative = toStorageRelative(absPath);

  try {
    const row = await insertAttachment(pool, {
      invoiceId,
      organizationId,
      filename: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      storagePath: relative,
      uploadedByOrgUserId: uploaderUserId,
    });
    return toAgencyAttachmentDto(row);
  } catch (error) {
    await removeFileQuiet(absPath);
    throw error;
  }
}

export async function listInvoiceAttachmentsService(
  organizationId: string,
  invoiceId: string,
): Promise<AgencyAttachmentDto[]> {
  const invoice = await findAgencyInvoiceById(pool, organizationId, invoiceId);
  if (!invoice) throw new HttpError(404, "Invoice not found.");
  const rows = await listAttachmentsByInvoice(pool, organizationId, invoiceId);
  return rows.map(toAgencyAttachmentDto);
}

export type AttachmentDownload = {
  absolutePath: string;
  filename: string;
  mimeType: string;
};

export async function getInvoiceAttachmentForDownloadService(
  organizationId: string,
  invoiceId: string,
  attachmentId: string,
): Promise<AttachmentDownload> {
  const attachment = await findAttachmentById(pool, organizationId, attachmentId);
  if (!attachment || attachment.invoice_id !== invoiceId) {
    throw new HttpError(404, "Attachment not found.");
  }
  const absolutePath = resolveStoragePath(attachment.storage_path);
  return {
    absolutePath,
    filename: attachment.filename,
    mimeType: attachment.mime_type,
  };
}

export async function deleteInvoiceAttachmentService(
  organizationId: string,
  invoiceId: string,
  attachmentId: string,
): Promise<void> {
  const attachment = await findAttachmentById(pool, organizationId, attachmentId);
  if (!attachment || attachment.invoice_id !== invoiceId) {
    throw new HttpError(404, "Attachment not found.");
  }
  const absolutePath = resolveStoragePath(attachment.storage_path);
  const removed = await deleteAttachmentRow(pool, organizationId, attachmentId);
  if (!removed) throw new HttpError(404, "Attachment not found.");
  await removeFileQuiet(absolutePath);
}
