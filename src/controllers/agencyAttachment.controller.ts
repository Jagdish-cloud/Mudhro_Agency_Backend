import { promises as fs } from "fs";
import type { Request, Response } from "express";

import {
  deleteInvoiceAttachmentService,
  getInvoiceAttachmentForDownloadService,
  listInvoiceAttachmentsService,
  uploadInvoiceAttachmentService,
} from "../services/agencyAttachment.service.js";
import { HttpError } from "../utils/httpError.js";
import { created, ok } from "../utils/responses.js";

function requireAuth(req: Request) {
  if (!req.auth) throw new HttpError(401, "Authentication required.");
  return req.auth;
}

function getParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, `${name} is required.`);
  }
  return value;
}

export async function uploadAttachmentController(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireAuth(req);
  const orgId = getParam(req, "orgId");
  const invoiceId = getParam(req, "invoiceId");
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) throw new HttpError(400, "File is required.");

  const result = await uploadInvoiceAttachmentService(orgId, auth.id, invoiceId, {
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    buffer: file.buffer,
  });
  res.status(201).json(created(result, "Attachment uploaded."));
}

export async function listAttachmentsController(
  req: Request,
  res: Response,
): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const invoiceId = getParam(req, "invoiceId");
  const result = await listInvoiceAttachmentsService(orgId, invoiceId);
  res.status(200).json(ok(result));
}

export async function downloadAttachmentController(
  req: Request,
  res: Response,
): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const invoiceId = getParam(req, "invoiceId");
  const id = getParam(req, "attachmentId");
  const dl = await getInvoiceAttachmentForDownloadService(orgId, invoiceId, id);
  const stat = await fs.stat(dl.absolutePath);
  res.setHeader("Content-Type", dl.mimeType);
  res.setHeader("Content-Length", String(stat.size));
  res.setHeader("Content-Disposition", `attachment; filename="${dl.filename}"`);
  const buffer = await fs.readFile(dl.absolutePath);
  res.status(200).send(buffer);
}

export async function deleteAttachmentController(
  req: Request,
  res: Response,
): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const invoiceId = getParam(req, "invoiceId");
  const id = getParam(req, "attachmentId");
  await deleteInvoiceAttachmentService(orgId, invoiceId, id);
  res.status(200).json(ok({ id }, "Attachment deleted."));
}
