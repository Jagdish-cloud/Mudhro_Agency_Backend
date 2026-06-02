import type { Request, Response } from "express";

import {
  createAgencyExpenseService,
  createExpenseItemService,
  createExpenseServiceService,
  deleteExpenseItemService,
  deleteExpenseServiceService,
  deleteExpenseServiceWithBlobs,
  downloadExpenseAttachmentBuffer,
  downloadExpensePdfBuffer,
  getAgencyExpenseService,
  getExpenseItemService,
  getExpenseServiceService,
  listExpenseItemsService,
  listExpensesForProjectService,
  listExpensesService,
  listExpenseServicesService,
  updateAgencyExpenseService,
  updateExpenseItemService,
  updateExpenseServiceService,
  uploadExpenseAttachmentService,
  uploadExpensePdfService,
} from "../services/agencyExpense.service.js";
import { HttpError } from "../utils/httpError.js";
import { decodeId } from "../utils/idCodec.js";
import { created, ok } from "../utils/responses.js";
import {
  createExpenseItemBodySchema,
  createExpenseSchema,
  createExpenseServiceSchema,
  listExpensesQuerySchema,
  updateExpenseItemBodySchema,
  updateExpenseSchema,
  updateExpenseServiceSchema,
} from "../validators/agencyExpense.schema.js";

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

/** --- Track visit (no-op) --- */
export async function trackExpenseVisitController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  getParam(req, "orgId");
  res.status(204).send();
}

/** --- Catalog --- */
export async function listExpenseServicesController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const result = await listExpenseServicesService(orgId);
  res.status(200).json(ok(result));
}

export async function createExpenseServiceController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const input = createExpenseServiceSchema.parse(req.body);
  const result = await createExpenseServiceService(orgId, input);
  res.status(201).json(created(result, "Expense service created."));
}

export async function getExpenseServiceController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const idRaw = getParam(req, "serviceId");
  const id = decodeId(idRaw);
  const result = await getExpenseServiceService(orgId, id);
  res.status(200).json(ok(result));
}

export async function updateExpenseServiceController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const idRaw = getParam(req, "serviceId");
  const id = decodeId(idRaw);
  const input = updateExpenseServiceSchema.parse(req.body);
  const result = await updateExpenseServiceService(orgId, id, input);
  res.status(200).json(ok(result, "Expense service updated."));
}

export async function deleteExpenseServiceController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const idRaw = getParam(req, "serviceId");
  const id = decodeId(idRaw);
  await deleteExpenseServiceService(orgId, id);
  res.status(200).json(ok({ id }, "Expense service deleted."));
}

/** --- Standalone expense items --- */
export async function getExpenseItemController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const idRaw = getParam(req, "itemId");
  const id = decodeId(idRaw);
  const result = await getExpenseItemService(orgId, id);
  res.status(200).json(ok(result));
}

export async function updateExpenseItemController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const idRaw = getParam(req, "itemId");
  const id = decodeId(idRaw);
  const input = updateExpenseItemBodySchema.parse(req.body);
  const result = await updateExpenseItemService(orgId, id, input);
  res.status(200).json(ok(result, "Line item updated."));
}

export async function deleteExpenseItemController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const idRaw = getParam(req, "itemId");
  const id = decodeId(idRaw);
  await deleteExpenseItemService(orgId, id);
  res.status(200).json(ok({ id }, "Line item deleted."));
}

/** --- Expenses --- */
export async function listExpensesController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const query = listExpensesQuerySchema.parse(req.query);
  const result = await listExpensesService(orgId, query);
  res.status(200).json(ok(result));
}

export async function listExpensesByProjectController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const projectId = decodeId(getParam(req, "projectId"));
  const result = await listExpensesForProjectService(orgId, projectId);
  res.status(200).json(ok(result));
}

export async function createExpenseController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const input = createExpenseSchema.parse(req.body);
  const result = await createAgencyExpenseService(orgId, input);
  res.status(201).json(created(result, "Expense created."));
}

export async function getExpenseController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const expenseId = decodeId(getParam(req, "expenseId"));
  const result = await getAgencyExpenseService(orgId, expenseId);
  res.status(200).json(ok(result));
}

export async function updateExpenseController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const expenseId = decodeId(getParam(req, "expenseId"));
  const input = updateExpenseSchema.parse(req.body);
  const result = await updateAgencyExpenseService(orgId, expenseId, input);
  res.status(200).json(ok(result, "Expense updated."));
}

export async function deleteExpenseController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const expenseId = decodeId(getParam(req, "expenseId"));
  await deleteExpenseServiceWithBlobs(orgId, expenseId);
  res.status(200).json(ok({ id: expenseId }, "Expense deleted."));
}

export async function listExpenseItemsNestedController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const expenseId = decodeId(getParam(req, "expenseId"));
  const result = await listExpenseItemsService(orgId, expenseId);
  res.status(200).json(ok(result));
}

export async function createExpenseItemNestedController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const expenseId = decodeId(getParam(req, "expenseId"));
  const input = createExpenseItemBodySchema.parse(req.body);
  const result = await createExpenseItemService(orgId, expenseId, input);
  res.status(201).json(created(result, "Line item created."));
}

export async function uploadExpenseAttachmentController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const expenseId = decodeId(getParam(req, "expenseId"));
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) throw new HttpError(400, "attachment file is required.");

  const result = await uploadExpenseAttachmentService(orgId, expenseId, {
    originalname: file.originalname,
    mimetype: file.mimetype,
    buffer: file.buffer,
    size: file.size,
  });
  res.status(200).json(ok(result, "Attachment uploaded."));
}

export async function uploadExpensePdfController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const expenseId = decodeId(getParam(req, "expenseId"));
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) throw new HttpError(400, "expensePdf file is required.");

  const result = await uploadExpensePdfService(orgId, expenseId, {
    originalname: file.originalname,
    mimetype: file.mimetype,
    buffer: file.buffer,
  });
  res.status(200).json(ok(result, "PDF uploaded."));
}

export async function downloadExpensePdfController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const expenseId = decodeId(getParam(req, "expenseId"));
  const { buffer, filename } = await downloadExpensePdfBuffer(orgId, expenseId);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", String(buffer.length));
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
}

export async function downloadExpenseAttachmentController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const expenseId = decodeId(getParam(req, "expenseId"));
  const { buffer, filename, contentType } = await downloadExpenseAttachmentBuffer(orgId, expenseId);
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", String(buffer.length));
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
}
