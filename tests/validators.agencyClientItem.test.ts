import { describe, expect, it } from "vitest";

import {
  createClientItemSchema,
  saveInvoiceRowToCatalogSchema,
  updateClientItemSchema,
} from "../src/validators/agencyClientItem.schema.js";

describe("createClientItemSchema", () => {
  it("requires itemName and hsnCode", () => {
    const r = createClientItemSchema.safeParse({
      itemName: "   ",
      hsnCode: "",
    });
    expect(r.success).toBe(false);
  });

  it("applies defaults for rate / tax / discount", () => {
    const r = createClientItemSchema.parse({
      itemName: "Design",
      hsnCode: "998314",
    });
    expect(r.defaultRate).toBe(0);
    expect(r.defaultTaxPercent).toBe(0);
    expect(r.defaultDiscountPercent).toBe(0);
  });

  it("enforces 0..100 on percentage fields", () => {
    const r = createClientItemSchema.safeParse({
      itemName: "Design",
      hsnCode: "998314",
      defaultTaxPercent: 101,
    });
    expect(r.success).toBe(false);
  });

  it("rejects negative rate", () => {
    const r = createClientItemSchema.safeParse({
      itemName: "Design",
      hsnCode: "998314",
      defaultRate: -1,
    });
    expect(r.success).toBe(false);
  });
});

describe("updateClientItemSchema", () => {
  it("requires at least one field", () => {
    const r = updateClientItemSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("accepts a single-field patch", () => {
    const r = updateClientItemSchema.safeParse({ defaultRate: 1500 });
    expect(r.success).toBe(true);
  });
});

describe("saveInvoiceRowToCatalogSchema", () => {
  it("coerces numeric strings from form inputs", () => {
    const r = saveInvoiceRowToCatalogSchema.parse({
      itemName: "Design",
      hsnCode: "998314",
      rate: "1500",
      taxPercent: "18",
      discountPercent: "0",
    });
    expect(r.rate).toBe(1500);
    expect(r.taxPercent).toBe(18);
  });

  it("rejects missing hsnCode", () => {
    const r = saveInvoiceRowToCatalogSchema.safeParse({
      itemName: "Design",
      rate: 1500,
    });
    expect(r.success).toBe(false);
  });
});
