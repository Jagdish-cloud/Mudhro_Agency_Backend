import path from "path";

import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import { findAgencyVendorById } from "../repositories/agencyVendor.repository.js";
import {
  deleteExpense,
  deleteExpenseItem,
  deleteExpenseService,
  findExpenseById,
  findExpenseItemById,
  findExpenseServiceById,
  insertExpense,
  insertExpenseItem,
  insertExpenseService,
  listExpenseItemsWithService,
  listExpensesByOrg,
  listExpensesByOrgFiltered,
  listExpensesByProject,
  listExpenseServicesByOrg,
  updateExpense,
  updateExpenseItem,
  updateExpenseService as updateExpenseCatalogInDb,
  type AgencyExpenseItemRow,
  type AgencyExpenseRow,
  type AgencyExpenseServiceRow,
  type ExpenseItemWithServiceRow,
} from "../repositories/agencyExpense.repository.js";
import { findAgencyProjectById } from "../repositories/agencyProject.repository.js";
import {
  deleteBlob,
  downloadBlobBuffer,
  expenseAttachmentBlobPath,
  expenseGeneratedPdfBlobPath,
  isAzureConfigured,
  legacyExpenseGeneratedPdfBlobPath,
  uploadBuffer,
} from "./azureBlob.service.js";
import {
  EXPENSE_ATTACHMENT_MIMES,
  assertSafeExpenseFilename,
  expenseAttachmentStoredName,
  expensePdfStoredName,
  extFromMime,
} from "../utils/expenseFiles.js";
import { computeExpenseAmounts, roundMoney } from "../utils/expenseAmounts.js";
import { HttpError } from "../utils/httpError.js";
import { z } from "zod";
import type {
  ListExpensesQuery,
  createExpenseItemBodySchema,
  createExpenseSchema,
  createExpenseServiceSchema,
  updateExpenseItemBodySchema,
  updateExpenseSchema,
  updateExpenseServiceSchema,
} from "../validators/agencyExpense.schema.js";

async function downloadGeneratedExpensePdfBuffer(
  container: string,
  organizationId: string,
  vendorId: string,
  fileName: string,
): Promise<Buffer> {
  const paths = [
    expenseGeneratedPdfBlobPath(organizationId, vendorId, fileName),
    legacyExpenseGeneratedPdfBlobPath(organizationId, fileName),
  ];
  let lastErr: unknown;
  for (const p of paths) {
    try {
      return await downloadBlobBuffer(container, p);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new HttpError(404, "PDF not found.");
}

function pgErrCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const c = (err as { code?: unknown }).code;
    return typeof c === "string" ? c : undefined;
  }
  return undefined;
}

function num(v: string | number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toExpenseDto(row: AgencyExpenseRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    vendorId: row.vendor_id,
    projectId: row.project_id,
    billNumber: row.bill_number,
    billDate: row.bill_date,
    dueDate: row.due_date,
    taxPercentage: num(row.tax_percentage),
    subTotalAmount: num(row.sub_total_amount),
    totalAmount: num(row.total_amount),
    attachmentFileName: row.attachment_file_name,
    expenseFileName: row.expense_file_name,
    additionalNotes: row.additional_notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toServiceDto(row: AgencyExpenseServiceRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    defaultRate: num(row.default_rate),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toItemDto(row: ExpenseItemWithServiceRow | AgencyExpenseItemRow, serviceName?: string) {
  return {
    id: row.id,
    expenseId: row.expense_id,
    serviceId: row.service_id,
    serviceName: "service_name" in row ? row.service_name : (serviceName ?? ""),
    quantity: num(row.quantity),
    unitPrice: num(row.unit_price),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function assertVendor(orgId: string, vendorId: string) {
  const vendor = await findAgencyVendorById(pool, orgId, vendorId);
  if (!vendor) throw new HttpError(400, "Vendor not found for this organization.");
}

async function assertProject(orgId: string, projectId: string | null | undefined) {
  if (!projectId) return;
  const project = await findAgencyProjectById(pool, orgId, projectId);
  if (!project) throw new HttpError(400, "Project not found for this organization.");
}

export async function syncExpenseTotalsFromDbItems(organizationId: string, expenseId: string) {
  const exp = await findExpenseById(pool, organizationId, expenseId);
  if (!exp) return;
  const items = await listExpenseItemsWithService(pool, organizationId, expenseId);
  const lines = items.map((i) => ({ quantity: num(i.quantity), unitPrice: num(i.unit_price) }));
  const amounts = computeExpenseAmounts({
    items: lines,
    taxPercentage: num(exp.tax_percentage),
    totalAmount: undefined,
  });
  await updateExpense(pool, organizationId, expenseId, {
    subTotalAmount: amounts.subTotalAmount,
    totalAmount: amounts.totalAmount,
  });
}

/** ---- Expense catalog (line types) ---- */
export async function listExpenseServicesService(organizationId: string) {
  const rows = await listExpenseServicesByOrg(pool, organizationId);
  return rows.map(toServiceDto);
}

export async function getExpenseServiceService(organizationId: string, id: string) {
  const row = await findExpenseServiceById(pool, organizationId, id);
  if (!row) throw new HttpError(404, "Expense service not found.");
  return toServiceDto(row);
}

export async function createExpenseServiceService(
  organizationId: string,
  input: z.infer<typeof createExpenseServiceSchema>,
) {
  try {
    const row = await insertExpenseService(pool, {
      organizationId,
      name: input.name.trim(),
      description: input.description ?? null,
      defaultRate: input.defaultRate ?? 0,
    });
    return toServiceDto(row);
  } catch (err) {
    if (pgErrCode(err) === "23505") {
      throw new HttpError(409, "A service with this name already exists.");
    }
    throw err;
  }
}

export async function updateExpenseServiceService(
  organizationId: string,
  id: string,
  input: z.infer<typeof updateExpenseServiceSchema>,
) {
  const patch: { name?: string; description?: string | null; defaultRate?: number } = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.description !== undefined) patch.description = input.description;
  if (input.defaultRate !== undefined) patch.defaultRate = input.defaultRate;

  try {
    const row = await updateExpenseCatalogInDb(pool, organizationId, id, patch);
    if (!row) throw new HttpError(404, "Expense service not found.");
    return toServiceDto(row);
  } catch (err) {
    if (pgErrCode(err) === "23505") {
      throw new HttpError(409, "A service with this name already exists.");
    }
    if (pgErrCode(err) === "23503") {
      throw new HttpError(409, "Cannot update: referenced by expense line items.");
    }
    throw err;
  }
}

export async function deleteExpenseServiceService(organizationId: string, id: string) {
  try {
    const okDel = await deleteExpenseService(pool, organizationId, id);
    if (!okDel) throw new HttpError(404, "Expense service not found.");
  } catch (err) {
    if (pgErrCode(err) === "23503") {
      throw new HttpError(409, "Cannot delete: still used on expense line items.");
    }
    throw err;
  }
}

/** ---- Expenses ---- */
const LIST_EXPENSES_QUERY_CAP = 500;

export async function listExpensesService(organizationId: string, query?: ListExpensesQuery) {
  const q = query ?? {};
  if (q.from !== undefined || q.to !== undefined || q.clientId !== undefined) {
    const rows = await listExpensesByOrgFiltered(pool, organizationId, {
      fromInclusive: q.from,
      toInclusive: q.to,
      clientId: q.clientId,
      limit: LIST_EXPENSES_QUERY_CAP,
    });
    return rows.map((r) => ({
      ...toExpenseDto(r),
      vendorName: r.vendor_name ? r.vendor_name : undefined,
    }));
  }
  const rows = await listExpensesByOrg(pool, organizationId);
  return rows.map(toExpenseDto);
}

export async function listExpensesForProjectService(organizationId: string, projectId: string) {
  await assertProject(organizationId, projectId);
  const rows = await listExpensesByProject(pool, organizationId, projectId);
  return rows.map((r) => ({
    ...toExpenseDto(r),
    vendorName: r.vendor_name,
  }));
}

export async function getAgencyExpenseService(organizationId: string, expenseId: string) {
  const row = await findExpenseById(pool, organizationId, expenseId);
  if (!row) throw new HttpError(404, "Expense not found.");
  return toExpenseDto(row);
}

export async function createAgencyExpenseService(
  organizationId: string,
  input: z.infer<typeof createExpenseSchema>,
) {
  await assertVendor(organizationId, input.vendorId);
  await assertProject(organizationId, input.projectId);

  const amounts = computeExpenseAmounts({
    items: input.items?.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice })),
    taxPercentage: input.taxPercentage ?? 0,
    totalAmount: input.totalAmount,
  });

  const row = await insertExpense(pool, {
    organizationId,
    vendorId: input.vendorId,
    projectId: input.projectId ?? null,
    billNumber: input.billNumber ?? null,
    billDate: input.billDate,
    dueDate: input.dueDate,
    taxPercentage: roundMoney(input.taxPercentage ?? 0),
    subTotalAmount: amounts.subTotalAmount,
    totalAmount: amounts.totalAmount,
    additionalNotes: input.additionalNotes ?? null,
  });
  return toExpenseDto(row);
}

export async function updateAgencyExpenseService(
  organizationId: string,
  expenseId: string,
  input: z.infer<typeof updateExpenseSchema>,
) {
  const existing = await findExpenseById(pool, organizationId, expenseId);
  if (!existing) throw new HttpError(404, "Expense not found.");

  if (input.vendorId !== undefined) {
    await assertVendor(organizationId, input.vendorId);
  }
  if (input.projectId !== undefined) {
    if (input.projectId === null) {
      /* clear */
    } else {
      await assertProject(organizationId, input.projectId);
    }
  }

  const mergedTax =
    input.taxPercentage !== undefined ? input.taxPercentage : num(existing.tax_percentage);

  const items = await listExpenseItemsWithService(pool, organizationId, expenseId);
  const lines = items.map((i) => ({ quantity: num(i.quantity), unitPrice: num(i.unit_price) }));

  let subTotalAmount: number | undefined;
  let totalAmount: number | undefined;

  if (lines.length > 0) {
    const computed = computeExpenseAmounts({
      items: lines,
      taxPercentage: mergedTax,
      totalAmount: input.totalAmount,
    });
    subTotalAmount = computed.subTotalAmount;
    totalAmount = computed.totalAmount;
  } else if (input.taxPercentage !== undefined || input.totalAmount !== undefined) {
    const computed = computeExpenseAmounts({
      items: [],
      taxPercentage: mergedTax,
      totalAmount: input.totalAmount ?? num(existing.total_amount),
    });
    subTotalAmount = computed.subTotalAmount;
    totalAmount = computed.totalAmount;
  }

  const patch: Parameters<typeof updateExpense>[3] = {};
  if (input.vendorId !== undefined) patch.vendorId = input.vendorId;
  if (input.projectId !== undefined) patch.projectId = input.projectId;
  if (input.billNumber !== undefined) patch.billNumber = input.billNumber;
  if (input.billDate !== undefined) patch.billDate = input.billDate;
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
  if (input.taxPercentage !== undefined) patch.taxPercentage = roundMoney(input.taxPercentage);
  if (input.additionalNotes !== undefined) patch.additionalNotes = input.additionalNotes;
  if (subTotalAmount !== undefined) patch.subTotalAmount = subTotalAmount;
  if (totalAmount !== undefined) patch.totalAmount = totalAmount;

  if (input.removeAttachment === true) {
    const oldAtt = existing.attachment_file_name;
    if (oldAtt && isAzureConfigured()) {
      const container = env.AZURE_BLOB_CONTAINER;
      await deleteBlob(container, expenseAttachmentBlobPath(organizationId, oldAtt));
    }
    patch.attachmentFileName = null;
  }

  if (input.vendorId !== undefined && input.vendorId !== existing.vendor_id) {
    if (existing.expense_file_name && isAzureConfigured()) {
      const container = env.AZURE_BLOB_CONTAINER;
      const pdf = existing.expense_file_name;
      await deleteBlob(
        container,
        expenseGeneratedPdfBlobPath(organizationId, existing.vendor_id, pdf),
      );
      await deleteBlob(container, legacyExpenseGeneratedPdfBlobPath(organizationId, pdf));
    }
    patch.expenseFileName = null;
  }

  const row = await updateExpense(pool, organizationId, expenseId, patch);
  if (!row) throw new HttpError(404, "Expense not found.");
  return toExpenseDto(row);
}

export async function deleteExpenseServiceWithBlobs(organizationId: string, expenseId: string) {
  const existing = await findExpenseById(pool, organizationId, expenseId);
  if (!existing) throw new HttpError(404, "Expense not found.");

  const container = env.AZURE_BLOB_CONTAINER;
  const att = existing.attachment_file_name;
  const pdf = existing.expense_file_name;

  await deleteExpense(pool, organizationId, expenseId);

  if (isAzureConfigured()) {
    if (att) {
      await deleteBlob(container, expenseAttachmentBlobPath(organizationId, att));
    }
    if (pdf) {
      await deleteBlob(
        container,
        expenseGeneratedPdfBlobPath(organizationId, existing.vendor_id, pdf),
      );
      await deleteBlob(container, legacyExpenseGeneratedPdfBlobPath(organizationId, pdf));
    }
  }
}

/** ---- Line items ---- */
export async function listExpenseItemsService(organizationId: string, expenseId: string) {
  const exp = await findExpenseById(pool, organizationId, expenseId);
  if (!exp) throw new HttpError(404, "Expense not found.");
  const rows = await listExpenseItemsWithService(pool, organizationId, expenseId);
  return rows.map((r) => toItemDto(r));
}

export async function createExpenseItemService(
  organizationId: string,
  expenseId: string,
  input: z.infer<typeof createExpenseItemBodySchema>,
) {
  const exp = await findExpenseById(pool, organizationId, expenseId);
  if (!exp) throw new HttpError(404, "Expense not found.");

  const svc = await findExpenseServiceById(pool, organizationId, input.serviceId);
  if (!svc) throw new HttpError(400, "Expense service not found.");

  const row = await insertExpenseItem(pool, {
    expenseId,
    serviceId: input.serviceId,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
  });

  await syncExpenseTotalsFromDbItems(organizationId, expenseId);

  const full = await findExpenseItemById(pool, organizationId, row.id);
  const name = svc.name;
  return full ? toItemDto(full, name) : toItemDto(row, name);
}

export async function getExpenseItemService(organizationId: string, itemId: string) {
  const row = await findExpenseItemById(pool, organizationId, itemId);
  if (!row) throw new HttpError(404, "Expense item not found.");
  const svc = await findExpenseServiceById(pool, organizationId, row.service_id);
  return toItemDto(row, svc?.name);
}

export async function updateExpenseItemService(
  organizationId: string,
  itemId: string,
  input: z.infer<typeof updateExpenseItemBodySchema>,
) {
  const existing = await findExpenseItemById(pool, organizationId, itemId);
  if (!existing) throw new HttpError(404, "Expense item not found.");

  if (input.serviceId !== undefined) {
    const svc = await findExpenseServiceById(pool, organizationId, input.serviceId);
    if (!svc) throw new HttpError(400, "Expense service not found.");
  }

  const row = await updateExpenseItem(pool, organizationId, itemId, {
    serviceId: input.serviceId,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
  });
  if (!row) throw new HttpError(404, "Expense item not found.");

  await syncExpenseTotalsFromDbItems(organizationId, existing.expense_id);

  const svc = await findExpenseServiceById(pool, organizationId, row.service_id);
  return toItemDto(row, svc?.name);
}

export async function deleteExpenseItemService(organizationId: string, itemId: string) {
  const existing = await findExpenseItemById(pool, organizationId, itemId);
  if (!existing) throw new HttpError(404, "Expense item not found.");

  const ok = await deleteExpenseItem(pool, organizationId, itemId);
  if (!ok) throw new HttpError(404, "Expense item not found.");

  await syncExpenseTotalsFromDbItems(organizationId, existing.expense_id);
}

/** ---- Attachment / PDF ---- */
export async function uploadExpenseAttachmentService(
  organizationId: string,
  expenseId: string,
  file: { originalname: string; mimetype: string; buffer: Buffer; size: number },
): Promise<ReturnType<typeof toExpenseDto>> {
  if (!isAzureConfigured()) {
    throw new HttpError(500, "Azure Blob Storage is not configured.");
  }

  const exp = await findExpenseById(pool, organizationId, expenseId);
  if (!exp) throw new HttpError(404, "Expense not found.");

  if (!EXPENSE_ATTACHMENT_MIMES.has(file.mimetype)) {
    throw new HttpError(400, "Invalid attachment type.");
  }

  const safeBase = assertSafeExpenseFilename(file.originalname);
  const ext = extFromMime(file.mimetype) || path.extname(safeBase);
  const storedName = expenseAttachmentStoredName({
    billNumber: exp.bill_number,
    expenseId: exp.id,
    ext: ext || ".bin",
  });

  const oldName = exp.attachment_file_name;
  const container = env.AZURE_BLOB_CONTAINER;
  const newPath = expenseAttachmentBlobPath(organizationId, storedName);

  await uploadBuffer(container, newPath, file.buffer, file.mimetype);

  if (oldName && oldName !== storedName) {
    await deleteBlob(container, expenseAttachmentBlobPath(organizationId, oldName));
  }

  const updated = await updateExpense(pool, organizationId, expenseId, {
    attachmentFileName: storedName,
  });
  if (!updated) throw new HttpError(404, "Expense not found.");
  return toExpenseDto(updated);
}

export async function uploadExpensePdfService(
  organizationId: string,
  expenseId: string,
  file: { originalname: string; mimetype: string; buffer: Buffer },
): Promise<ReturnType<typeof toExpenseDto>> {
  if (!isAzureConfigured()) {
    throw new HttpError(500, "Azure Blob Storage is not configured.");
  }
  if (file.mimetype !== "application/pdf") {
    throw new HttpError(400, "Only PDF uploads are allowed.");
  }

  const exp = await findExpenseById(pool, organizationId, expenseId);
  if (!exp) throw new HttpError(404, "Expense not found.");

  const storedName = expensePdfStoredName({
    billNumber: exp.bill_number,
    expenseId: exp.id,
  });

  const oldName = exp.expense_file_name;
  const container = env.AZURE_BLOB_CONTAINER;
  const vendorId = exp.vendor_id;
  const newPath = expenseGeneratedPdfBlobPath(organizationId, vendorId, storedName);

  await uploadBuffer(container, newPath, file.buffer, "application/pdf");

  if (oldName && oldName !== storedName) {
    await deleteBlob(
      container,
      expenseGeneratedPdfBlobPath(organizationId, vendorId, oldName),
    );
    await deleteBlob(container, legacyExpenseGeneratedPdfBlobPath(organizationId, oldName));
  }

  const updated = await updateExpense(pool, organizationId, expenseId, {
    expenseFileName: storedName,
  });
  if (!updated) throw new HttpError(404, "Expense not found.");
  return toExpenseDto(updated);
}

export async function downloadExpensePdfBuffer(
  organizationId: string,
  expenseId: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const exp = await findExpenseById(pool, organizationId, expenseId);
  if (!exp) throw new HttpError(404, "Expense not found.");
  if (!exp.expense_file_name) {
    throw new HttpError(404, "No generated PDF for this expense.");
  }
  if (!isAzureConfigured()) {
    throw new HttpError(500, "Azure Blob Storage is not configured.");
  }
  const buffer = await downloadGeneratedExpensePdfBuffer(
    env.AZURE_BLOB_CONTAINER,
    organizationId,
    exp.vendor_id,
    exp.expense_file_name,
  );
  const filename = expensePdfStoredName({ billNumber: exp.bill_number, expenseId: exp.id });
  return { buffer, filename };
}

export async function downloadExpenseAttachmentBuffer(
  organizationId: string,
  expenseId: string,
): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
  const exp = await findExpenseById(pool, organizationId, expenseId);
  if (!exp) throw new HttpError(404, "Expense not found.");
  if (!exp.attachment_file_name) {
    throw new HttpError(404, "No attachment for this expense.");
  }
  if (!isAzureConfigured()) {
    throw new HttpError(500, "Azure Blob Storage is not configured.");
  }
  const blobPath = expenseAttachmentBlobPath(organizationId, exp.attachment_file_name);
  const buffer = await downloadBlobBuffer(env.AZURE_BLOB_CONTAINER, blobPath);

  const ext = exp.attachment_file_name.toLowerCase().split(".").pop();
  let contentType = "application/octet-stream";
  if (ext === "pdf") contentType = "application/pdf";
  else if (ext === "png") contentType = "image/png";
  else if (ext === "jpg" || ext === "jpeg") contentType = "image/jpeg";
  else if (ext === "gif") contentType = "image/gif";
  else if (ext === "webp") contentType = "image/webp";

  return { buffer, filename: exp.attachment_file_name, contentType };
}
