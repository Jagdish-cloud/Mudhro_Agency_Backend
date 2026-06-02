import type {
  ClientReportDto,
  OverallReportDto,
  PaymentPendingReportDto,
  ReportPdfTables,
} from "./agencyReport.service.js";
import {
  buildClientReportHtml,
  buildOverallReportHtml,
  buildPaymentPendingReportHtml,
} from "./reportPreviewHtml.js";
import { renderHtmlToPdf } from "../utils/renderHtmlToPdf.js";

function safeFilenamePart(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "report";
}

export async function generateOverallReportPdf(
  report: OverallReportDto,
  tables: ReportPdfTables,
): Promise<{ buffer: Buffer; filename: string }> {
  const html = buildOverallReportHtml(report, tables);
  const buffer = await renderHtmlToPdf(html);
  return {
    buffer,
    filename: `${safeFilenamePart(`overall-report-${report.period.label}`)}.pdf`,
  };
}

export async function generateClientReportPdf(
  report: ClientReportDto,
  tables: ReportPdfTables,
): Promise<{ buffer: Buffer; filename: string }> {
  const html = buildClientReportHtml(report, tables);
  const buffer = await renderHtmlToPdf(html);
  return {
    buffer,
    filename: `${safeFilenamePart(`client-report-${report.clientName}-${report.period.label}`)}.pdf`,
  };
}

export async function generatePaymentPendingReportPdf(
  report: PaymentPendingReportDto,
): Promise<{ buffer: Buffer; filename: string }> {
  const html = buildPaymentPendingReportHtml(report);
  const buffer = await renderHtmlToPdf(html);
  const slug = report.period ? safeFilenamePart(`pending-${report.period.label}`) : "pending-all";
  return { buffer, filename: `${slug}.pdf` };
}
