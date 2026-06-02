import type { Request, Response } from "express";

import {
  getClientReportService,
  getMonthlyReportService,
  getOverallReportService,
  getPaymentPendingReportService,
  getReportPdfTables,
} from "../services/agencyReport.service.js";
import {
  generateClientReportPdf,
  generateOverallReportPdf,
  generatePaymentPendingReportPdf,
} from "../services/agencyReportPdf.service.js";
import { HttpError } from "../utils/httpError.js";
import { ok } from "../utils/responses.js";
import { monthlyReportQuerySchema } from "../validators/agencyInvoice.schema.js";
import {
  agencyClientReportParamsSchema,
  agencyReportPeriodQuerySchema,
} from "../validators/agencyReport.schema.js";

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

export async function getMonthlyReportController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const { month } = monthlyReportQuerySchema.parse(req.query);
  const result = await getMonthlyReportService(orgId, month);
  res.status(200).json(ok(result));
}

export async function getOverallReportController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const query = agencyReportPeriodQuerySchema.parse(req.query);
  const result = await getOverallReportService(orgId, query);
  res.status(200).json(ok(result));
}

export async function downloadOverallReportPdfController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const query = agencyReportPeriodQuerySchema.parse(req.query);
  const report = await getOverallReportService(orgId, query);
  const tables = await getReportPdfTables(orgId, report.period, undefined);
  const { buffer, filename } = await generateOverallReportPdf(report, tables);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
}

export async function getClientReportController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const { clientId } = agencyClientReportParamsSchema.parse(req.params);
  const query = agencyReportPeriodQuerySchema.parse(req.query);
  const result = await getClientReportService(orgId, clientId, query);
  res.status(200).json(ok(result));
}

export async function downloadClientReportPdfController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const { clientId } = agencyClientReportParamsSchema.parse(req.params);
  const query = agencyReportPeriodQuerySchema.parse(req.query);
  const report = await getClientReportService(orgId, clientId, query);
  const tables = await getReportPdfTables(orgId, report.period, clientId);
  const { buffer, filename } = await generateClientReportPdf(report, tables);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
}

export async function getPaymentPendingReportController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const query = agencyReportPeriodQuerySchema.parse(req.query);
  const result = await getPaymentPendingReportService(orgId, query);
  res.status(200).json(ok(result));
}

export async function downloadPaymentPendingReportPdfController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const query = agencyReportPeriodQuerySchema.parse(req.query);
  const report = await getPaymentPendingReportService(orgId, query);
  const { buffer, filename } = await generatePaymentPendingReportPdf(report);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
}
