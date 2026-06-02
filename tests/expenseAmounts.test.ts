import { describe, expect, it } from "vitest";

import { computeExpenseAmounts, roundMoney } from "../src/utils/expenseAmounts.js";

describe("computeExpenseAmounts", () => {
  it("sums lines and applies tax when totalAmount omitted", () => {
    const r = computeExpenseAmounts({
      items: [{ quantity: 2, unitPrice: 100 }],
      taxPercentage: 10,
    });
    expect(r.subTotalAmount).toBe(200);
    expect(r.totalAmount).toBe(220);
  });

  it("derives subtotal from inclusive total when no lines and tax > 0", () => {
    const r = computeExpenseAmounts({
      items: [],
      taxPercentage: 18,
      totalAmount: 118,
    });
    expect(roundMoney(r.subTotalAmount)).toBe(100);
    expect(r.totalAmount).toBe(118);
  });

  it("uses explicit totalAmount when provided with line items", () => {
    const r = computeExpenseAmounts({
      items: [{ quantity: 1, unitPrice: 100 }],
      taxPercentage: 10,
      totalAmount: 999,
    });
    expect(r.subTotalAmount).toBe(100);
    expect(r.totalAmount).toBe(999);
  });
});
