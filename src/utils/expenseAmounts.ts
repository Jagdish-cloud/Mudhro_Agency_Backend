/**
 * Expense totals (aligned with product spec): tax as single percentage on subtotal.
 */
export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type ExpenseLineForTotals = { quantity: number; unitPrice: number };

export function computeExpenseAmounts(args: {
  items?: ExpenseLineForTotals[] | undefined;
  taxPercentage: number;
  totalAmount?: number | null | undefined;
}): { subTotalAmount: number; totalAmount: number } {
  const tax = args.taxPercentage ?? 0;
  const items = args.items ?? [];

  let subtotal = 0;
  if (items.length > 0) {
    subtotal = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0);
  } else {
    const totalProvided = args.totalAmount;
    if (totalProvided != null && Number.isFinite(Number(totalProvided)) && Number(totalProvided) >= 0) {
      const total = Number(totalProvided);
      subtotal = tax > 0 ? total / (1 + tax / 100) : total;
    }
  }

  const totalAmount =
    args.totalAmount != null && args.totalAmount !== undefined && Number.isFinite(Number(args.totalAmount))
      ? Number(args.totalAmount)
      : subtotal + subtotal * (tax / 100);

  return {
    subTotalAmount: roundMoney(subtotal),
    totalAmount: roundMoney(totalAmount),
  };
}
