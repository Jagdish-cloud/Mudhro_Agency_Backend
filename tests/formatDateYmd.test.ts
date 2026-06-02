import { describe, expect, it } from "vitest";

import { formatDateYmd, formatDateYmdOrDash } from "../src/utils/formatDateYmd.js";
import { buildOverallReportHtml } from "../src/services/reportPreviewHtml.js";
import type { OverallReportDto } from "../src/services/agencyReport.service.js";

describe("formatDateYmd", () => {
  it("formats JavaScript Date as yyyy-mm-dd", () => {
    expect(formatDateYmd(new Date(2026, 4, 16))).toBe("2026-05-16");
  });

  it("passes through yyyy-mm-dd strings", () => {
    expect(formatDateYmd("2026-05-16")).toBe("2026-05-16");
  });

  it("does not emit locale date strings in report html", () => {
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
      expenses: { expenseCount: 1, expenseTotalAmount: 12, topVendors: [] },
      netInvoicedMinusExpenses: 88,
    };
    const html = buildOverallReportHtml(report, {
      invoiceRows: [],
      expenseRows: [
        {
          billLabel: "BILL-1",
          vendorName: "Vendor",
          billDate: new Date(2026, 4, 16) as unknown as string,
          dueDate: new Date(2026, 4, 29) as unknown as string,
          totalAmount: 12,
        },
      ],
    });
    expect(html).toContain("2026-05-16");
    expect(html).toContain("2026-05-29");
    expect(html).not.toContain("GMT");
    expect(formatDateYmdOrDash(new Date(2026, 4, 16))).toBe("2026-05-16");
  });
});
