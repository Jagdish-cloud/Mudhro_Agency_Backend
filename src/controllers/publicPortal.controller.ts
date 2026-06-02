import type { Request, Response } from "express";

import {
  getPortalInvoiceByTokenService,
  markPortalInvoiceViewedService,
} from "../services/agencyPortal.service.js";
import { generateInvoicePdf } from "../services/agencyInvoicePdf.service.js";
import { HttpError } from "../utils/httpError.js";
import { ok } from "../utils/responses.js";

function getParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, `${name} is required.`);
  }
  return value;
}

// Very lightweight per-IP + per-token rate limit to blunt trivial scraping.
const rateBuckets = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

function checkRateLimit(key: string): void {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(key, { count: 1, windowStart: now });
    return;
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_MAX) {
    throw new HttpError(429, "Too many requests; slow down.");
  }
}

export async function getPortalInvoiceController(
  req: Request,
  res: Response,
): Promise<void> {
  const token = getParam(req, "token");
  const ip = req.ip ?? "unknown";
  checkRateLimit(`${ip}:${token}`);
  const { invoice } = await getPortalInvoiceByTokenService(token);
  res.status(200).json(ok(invoice));
}

export async function getPortalInvoicePdfController(
  req: Request,
  res: Response,
): Promise<void> {
  const token = getParam(req, "token");
  const ip = req.ip ?? "unknown";
  checkRateLimit(`${ip}:${token}`);
  const { invoiceId, organizationId } = await getPortalInvoiceByTokenService(token);
  const { buffer, filename } = await generateInvoicePdf(organizationId, invoiceId);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.status(200).send(buffer);
}

export async function markPortalInvoiceViewedController(
  req: Request,
  res: Response,
): Promise<void> {
  const token = getParam(req, "token");
  const ip = req.ip ?? "unknown";
  checkRateLimit(`${ip}:${token}`);
  await markPortalInvoiceViewedService(token);
  res.status(200).json(ok({ token }, "Invoice marked as viewed."));
}
