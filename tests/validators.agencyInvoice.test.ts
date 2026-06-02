import { describe, expect, it } from "vitest";

import {
  createInvoiceSchema,
  invoiceItemSchema,
  listInvoicesQuerySchema,
  recordPaymentSchema,
  updateInvoiceSchema,
} from "../src/validators/agencyInvoice.schema.js";

describe("agencyInvoice validators - line items", () => {
  it("rejects items without an HSN code", () => {
    const parsed = invoiceItemSchema.safeParse({
      itemName: "Design",
      qty: 1,
      rate: 1000,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.includes("hsnCode"))).toBe(true);
    }
  });

  it("accepts a valid line with HSN", () => {
    const parsed = invoiceItemSchema.safeParse({
      itemName: "Design",
      hsnCode: "9983",
      qty: 1,
      rate: 1000,
      discountPercent: 0,
      taxPercent: 18,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects non-positive quantity", () => {
    const parsed = invoiceItemSchema.safeParse({
      itemName: "Design",
      hsnCode: "9983",
      qty: 0,
      rate: 100,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("agencyInvoice validators - create", () => {
  const baseInvoice = {
    clientId: "11111111-1111-4111-8111-111111111111",
    issueDate: "2026-01-15",
    dueDate: "2026-02-15",
    currency: "INR",
    reminderOffsets: [0],
    items: [
      {
        itemName: "Design",
        hsnCode: "9983",
        qty: 1,
        rate: 1000,
        discountPercent: 0,
        taxPercent: 18,
      },
    ],
  };

  it("requires at least one line item", () => {
    const parsed = createInvoiceSchema.safeParse({ ...baseInvoice, items: [] });
    expect(parsed.success).toBe(false);
  });

  it("rejects a dueDate before the issueDate", () => {
    const parsed = createInvoiceSchema.safeParse({
      ...baseInvoice,
      dueDate: "2026-01-01",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a valid 3-letter ISO currency code", () => {
    const parsed = createInvoiceSchema.safeParse(baseInvoice);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.currency).toBe("INR");
    }
  });

  it("rejects invalid place of supply", () => {
    const parsed = createInvoiceSchema.safeParse({
      ...baseInvoice,
      placeOfSupply: "MH",
    });
    expect(parsed.success).toBe(false);
  });

  it("requires reminderOffsets when reminders are enabled", () => {
    const parsed = createInvoiceSchema.safeParse({
      ...baseInvoice,
      remindersEnabled: true,
      reminderOffsets: [],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("agencyInvoice validators - update", () => {
  it("requires at least one field", () => {
    const parsed = updateInvoiceSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  it("accepts a partial update", () => {
    const parsed = updateInvoiceSchema.safeParse({ notes: "Follow up" });
    expect(parsed.success).toBe(true);
  });
});

describe("agencyInvoice validators - list query", () => {
  it("coerces overdue and page to their proper types", () => {
    const parsed = listInvoicesQuerySchema.safeParse({
      overdue: "true",
      page: "2",
      limit: "10",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.overdue).toBe(true);
      expect(parsed.data.page).toBe(2);
      expect(parsed.data.limit).toBe(10);
    }
  });
});

describe("agencyInvoice validators - record payment", () => {
  it("requires a positive amount", () => {
    expect(recordPaymentSchema.safeParse({ amount: 0, method: "cash" }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ amount: -10, method: "cash" }).success).toBe(false);
  });

  it("accepts a valid payment payload", () => {
    const parsed = recordPaymentSchema.safeParse({
      amount: 500,
      method: "upi",
      reference: "UPI/12345",
    });
    expect(parsed.success).toBe(true);
  });

  it("defaults method to 'other'", () => {
    const parsed = recordPaymentSchema.safeParse({ amount: 10 });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.method).toBe("other");
    }
  });

  it("rejects negative deductions", () => {
    expect(
      recordPaymentSchema.safeParse({
        amount: 100,
        paymentGatewayFee: -1,
      }).success,
    ).toBe(false);
  });

  it("defaults deductions to zero", () => {
    const parsed = recordPaymentSchema.safeParse({ amount: 100, method: "cash" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.paymentGatewayFee).toBe(0);
      expect(parsed.data.tdsDeducted).toBe(0);
      expect(parsed.data.otherDeduction).toBe(0);
    }
  });
});
