import type { Request, Response } from "express";

import {
  createAgencyInvoiceService,
  deleteAgencyInvoiceService,
  getAgencyInvoiceService,
  listAgencyInvoicesService,
  rotateInvoicePortalTokenService,
  updateAgencyInvoiceService,
} from "../services/agencyInvoice.service.js";
import { sendInvoiceEmailService } from "../services/agencyInvoiceMail.service.js";
import {
  listInvoicePaymentsService,
  recordInvoicePaymentService,
} from "../services/agencyInvoicePayment.service.js";
import { generateInvoicePdf } from "../services/agencyInvoicePdf.service.js";
import {
  cancelInvoiceReminderService,
  createInvoiceReminderService,
  listInvoiceRemindersService,
} from "../services/agencyInvoiceReminder.service.js";
import { HttpError } from "../utils/httpError.js";
import { created, ok } from "../utils/responses.js";
import {
  createInvoiceSchema,
  createReminderSchema,
  listInvoicesQuerySchema,
  recordPaymentSchema,
  sendInvoiceSchema,
  updateInvoiceSchema,
} from "../validators/agencyInvoice.schema.js";

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

export async function createInvoiceController(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const orgId = getParam(req, "orgId");
  const input = createInvoiceSchema.parse(req.body);
  const result = await createAgencyInvoiceService(orgId, auth, input);
  res.status(201).json(created(result, "Invoice created successfully."));
}

export async function listInvoicesController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const query = listInvoicesQuerySchema.parse(req.query);
  const result = await listAgencyInvoicesService(orgId, query);
  res.status(200).json(ok(result));
}

export async function getInvoiceController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = getParam(req, "invoiceId");
  const result = await getAgencyInvoiceService(orgId, id);
  res.status(200).json(ok(result));
}

export async function updateInvoiceController(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = getParam(req, "invoiceId");
  const input = updateInvoiceSchema.parse(req.body);
  const result = await updateAgencyInvoiceService(orgId, auth, id, input);
  res.status(200).json(ok(result, "Invoice updated successfully."));
}

export async function deleteInvoiceController(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = getParam(req, "invoiceId");
  await deleteAgencyInvoiceService(orgId, auth, id);
  res.status(200).json(ok({ id }, "Invoice cancelled successfully."));
}

export async function sendInvoiceController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = getParam(req, "invoiceId");
  const input = sendInvoiceSchema.parse(req.body ?? {});
  const result = await sendInvoiceEmailService(orgId, id, input);
  res.status(200).json(ok(result, "Invoice dispatched."));
}

export async function downloadInvoicePdfController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = getParam(req, "invoiceId");
  const { buffer, filename } = await generateInvoicePdf(orgId, id);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
}

export async function rotatePortalTokenController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = getParam(req, "invoiceId");
  const token = await rotateInvoicePortalTokenService(orgId, id);
  res.status(200).json(ok({ portalToken: token }, "Portal token rotated."));
}

export async function recordPaymentController(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = getParam(req, "invoiceId");
  const input = recordPaymentSchema.parse(req.body);
  const result = await recordInvoicePaymentService(orgId, auth.id, id, input);
  res.status(201).json(created(result, "Payment recorded."));
}

export async function listPaymentsController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = getParam(req, "invoiceId");
  const result = await listInvoicePaymentsService(orgId, id);
  res.status(200).json(ok(result));
}

export async function listRemindersController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = getParam(req, "invoiceId");
  const result = await listInvoiceRemindersService(orgId, id);
  res.status(200).json(ok(result));
}

export async function createReminderController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = getParam(req, "invoiceId");
  const input = createReminderSchema.parse(req.body);
  const result = await createInvoiceReminderService(orgId, id, input);
  res.status(201).json(created(result, "Reminder scheduled."));
}

export async function cancelReminderController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = getParam(req, "invoiceId");
  const reminderId = getParam(req, "reminderId");
  await cancelInvoiceReminderService(orgId, id, reminderId);
  res.status(200).json(ok({ id: reminderId }, "Reminder cancelled."));
}
