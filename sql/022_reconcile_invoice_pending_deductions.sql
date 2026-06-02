-- Recompute amount_pending to subtract recorded payment deductions (gateway/TDS/other).
-- Optionally set status to paid when amount_received + sum(deductions) covers grand_total.
--
-- Down migration (manual): not reversible without a snapshot of prior values.

WITH pay_ded AS (
  SELECT
    invoice_id,
    COALESCE(SUM(
      COALESCE(payment_gateway_fee, 0)
      + COALESCE(tds_deducted, 0)
      + COALESCE(other_deduction, 0)
    ), 0)::numeric(14, 2) AS ded_total
  FROM agency_invoice_payments
  GROUP BY invoice_id
),
adj AS (
  SELECT
    i.id,
    GREATEST(
      0::numeric,
      i.grand_total::numeric - i.amount_received::numeric - COALESCE(d.ded_total, 0)
    ) AS new_pending,
    (i.amount_received::numeric + COALESCE(d.ded_total, 0)) AS settled
  FROM agency_invoices i
  LEFT JOIN pay_ded d ON d.invoice_id = i.id
  WHERE i.deleted_at IS NULL
)
UPDATE agency_invoices i
SET
  amount_pending = adj.new_pending,
  status = CASE
    WHEN i.status = 'cancelled' THEN i.status
    WHEN i.status = 'draft' THEN i.status
    WHEN adj.settled + 0.01 >= i.grand_total::numeric AND i.grand_total::numeric > 0 THEN 'paid'
    ELSE i.status
  END
FROM adj
WHERE i.id = adj.id;
