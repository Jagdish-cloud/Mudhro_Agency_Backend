import { describe, expect, it } from "vitest";

import {
  buildOverallReportHtml,
  buildPaymentPendingReportHtml,
} from "../src/services/reportPreviewHtml.js";
import type { OverallReportDto } from "../src/services/agencyReport.service.js";

describe("reportPreviewHtml", () => {
  it("renders table header cells with generous padding and first-row spacing", () => {
    const report: OverallReportDto = {
      period: { label: "May 2026", fromInclusive: "2026-05-01", toInclusive: "2026-05-31" },
      invoices: {
        currency: "INR",
        invoicedAmount: 100,
        receivedAmount: 100,
        pendingAmount: 0,
        overdueAmount: 0,
        overdueCount: 0,
        invoiceCount: 1,
        paidCount: 1,
        topClients: [],
        statusBreakdown: [],
      },
      expenses: { expenseCount: 0, expenseTotalAmount: 0, topVendors: [] },
      netInvoicedMinusExpenses: 100,
    };
    const html = buildOverallReportHtml(report, {
      invoiceRows: [
        {
          invoiceNumber: "INV-1",
          clientName: "Acme",
          issueDate: "2026-05-01",
          dueDate: "2026-05-15",
          status: "paid",
          currency: "INR",
          grandTotal: 100,
          amountPending: 0,
        },
      ],
      expenseRows: [],
    });

    expect(html).toContain("Grand total");
    expect(html).toContain("Issue date");
    expect(html).toContain("padding: 16px 12px 22px");
    expect(html).toContain("tbody tr:first-child td");
    expect(html).toContain("₹");
  });

  it("renders pending report table headers", () => {
    const html = buildPaymentPendingReportHtml({
      period: null,
      invoiceCount: 0,
      totalPendingAmount: 0,
      items: [],
    });
    expect(html).toContain("Outstanding invoices");
    expect(html).toContain("Pending");
  });
});
