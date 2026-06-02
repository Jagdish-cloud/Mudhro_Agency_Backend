import { describe, expect, it } from "vitest";

import {
  buildInvoicePreviewHtml,
  escapeHtml,
  formatCurrencyForInvoice,
  formatInvoicePreviewDate,
  renderInvoiceHtmlToPdf,
  type InvoicePreviewViewModel,
} from "../src/services/invoicePreviewHtml.js";

const baseModel = (): InvoicePreviewViewModel => ({
  orgName: "Acme Org",
  orgAddress: "Line 1\nLine 2",
  orgEmail: "org@acme.test",
  orgMobile: "+91 90000 00000",
  orgGstNumber: "22AAAAA0000A1Z5",
  invoiceNumber: "INV-2026-001",
  issueDateLabel: "15 Jan 2026",
  dueDateLabel: "30 Jan 2026",
  currency: "INR",
  billTo: {
    name: "Client Co",
    contactName: "Riya",
    billingAddress: "Bangalore",
    email: "client@test",
    gstNumber: "29BBBBB0000B1Z1",
  },
  lineItems: [
    {
      itemName: "Design",
      description: "Phase 1",
      hsnCode: "9983",
      qty: 1,
      unitPrice: 10000,
      discountPercent: 0,
      lineTotal: 11800,
    },
  ],
  subtotal: 10000,
  discountTotal: 0,
  taxTotal: 1800,
  grandTotal: 11800,
  cgstTotal: 900,
  sgstTotal: 900,
  igstTotal: 0,
  hsnList: ["9983"],
  amountsInclusiveOfTax: false,
  notes: null,
});

describe("escapeHtml", () => {
  it("escapes HTML-special characters", () => {
    expect(escapeHtml(`a<b>&"'`)).toBe("a&lt;b&gt;&amp;&quot;&#39;");
  });
});

describe("formatInvoicePreviewDate", () => {
  it("formats like the invoice preview card (en-IN)", () => {
    const d = new Date(2026, 0, 15);
    const label = formatInvoicePreviewDate(d);
    expect(label).toMatch(/15/);
    expect(label).toMatch(/2026/);
  });
});

describe("formatCurrencyForInvoice", () => {
  it("formats INR with numbering conventions", () => {
    const s = formatCurrencyForInvoice(1234.5, "INR");
    expect(s).toContain("1,234.50");
    expect(s).toMatch(/₹|INR/);
  });
});

describe("buildInvoicePreviewHtml", () => {
  it("includes preview-card structure and labels", () => {
    const html = buildInvoicePreviewHtml(baseModel());
    expect(html).toContain("Bill To");
    expect(html).toContain("Description");
    expect(html).toContain("HSN/SAC");
    expect(html).toContain("Unit Price");
    expect(html).toContain("Disc %");
    expect(html).toContain("Tax Details");
    expect(html).toContain("Thank you for your business.");
    expect(html).toContain("INV-2026-001");
    expect(html).toContain("CGST:");
    expect(html).toContain("SGST:");
    expect(html).toContain("SAC/HSN:");
  });

  it("escapes injected markup in text fields", () => {
    const m = baseModel();
    m.lineItems[0].itemName = '<script>alert(1)</script>';
    const html = buildInvoicePreviewHtml(m);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("shows the empty line-items hint when there are no rows", () => {
    const m = baseModel();
    m.lineItems = [];
    const html = buildInvoicePreviewHtml(m);
    expect(html).toContain("Add a line item to preview the invoice.");
  });

  it("shows inclusive GST note when flagged", () => {
    const m = baseModel();
    m.amountsInclusiveOfTax = true;
    const html = buildInvoicePreviewHtml(m);
    expect(html).toContain("Amounts entered are inclusive of GST.");
  });

  it("omits discount row when discount is zero", () => {
    const html = buildInvoicePreviewHtml(baseModel());
    expect(html).not.toContain("Discount");
  });

  it("shows discount row when greater than zero", () => {
    const m = baseModel();
    m.discountTotal = 100;
    const html = buildInvoicePreviewHtml(m);
    expect(html).toContain("Discount");
  });
});

describe("renderInvoiceHtmlToPdf", () => {
  it("returns a PDF buffer for minimal HTML", async () => {
    const html =
      "<!DOCTYPE html><html><body><p>ok</p></body></html>";
    const buf = await renderInvoiceHtmlToPdf(html);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
