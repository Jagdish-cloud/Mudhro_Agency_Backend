import path from "path";

import { HttpError } from "./httpError.js";

const DANGEROUS_EXT = new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".msi",
  ".scr",
  ".com",
  ".ps1",
  ".vbs",
  ".js",
  ".jar",
]);

export const EXPENSE_ATTACHMENT_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

const ATTACH_EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

export function assertSafeExpenseFilename(originalName: string): string {
  const trimmed = originalName.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) {
    throw new HttpError(400, "Invalid file name.");
  }
  const base = path.basename(trimmed);
  if (base !== trimmed) {
    throw new HttpError(400, "Invalid file name.");
  }
  const ext = path.extname(base).toLowerCase();
  if (DANGEROUS_EXT.has(ext)) {
    throw new HttpError(400, "File type not allowed.");
  }
  if (!ATTACH_EXT_TO_MIME[ext]) {
    throw new HttpError(400, "Allowed extensions: jpg, jpeg, png, gif, webp, pdf.");
  }
  return base;
}

export function expenseAttachmentStoredName(args: {
  billNumber: string | null;
  expenseId: string;
  ext: string;
}): string {
  const ts = Date.now();
  const baseBill = (args.billNumber?.trim() || `BILL-${args.expenseId}`).replace(/[/\\]/g, "_");
  const safeExt = args.ext.startsWith(".") ? args.ext : `.${args.ext}`;
  return `${baseBill}_${ts}${safeExt}`;
}

export function expensePdfStoredName(args: {
  billNumber: string | null;
  expenseId: string;
}): string {
  const raw = (args.billNumber?.trim() || `BILL-${args.expenseId}`).replace(/[/\\]/g, "_");
  if (raw.toLowerCase().endsWith(".pdf")) {
    return raw;
  }
  return `${raw}.pdf`;
}

export function extFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    case "application/pdf":
      return ".pdf";
    default:
      return "";
  }
}
