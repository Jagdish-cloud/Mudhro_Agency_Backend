-- Per-payment deductions (gateway, TDS, other) and snapshot of pending balance
-- before the payment (for “difference” vs net bank credit).
--
-- Down migration (manual):
--   ALTER TABLE agency_invoice_payments
--     DROP CONSTRAINT IF EXISTS agency_payments_fee_nonnegative_chk,
--     DROP CONSTRAINT IF EXISTS agency_payments_tds_nonnegative_chk,
--     DROP CONSTRAINT IF EXISTS agency_payments_other_nonnegative_chk;
--   ALTER TABLE agency_invoice_payments
--     DROP COLUMN IF EXISTS payment_gateway_fee,
--     DROP COLUMN IF EXISTS tds_deducted,
--     DROP COLUMN IF EXISTS other_deduction,
--     DROP COLUMN IF EXISTS settlement_reference_amount;

ALTER TABLE agency_invoice_payments
  ADD COLUMN IF NOT EXISTS payment_gateway_fee NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tds_deducted NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_deduction NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settlement_reference_amount NUMERIC(14, 2) NULL;

ALTER TABLE agency_invoice_payments
  DROP CONSTRAINT IF EXISTS agency_payments_fee_nonnegative_chk,
  ADD CONSTRAINT agency_payments_fee_nonnegative_chk CHECK (payment_gateway_fee >= 0);

ALTER TABLE agency_invoice_payments
  DROP CONSTRAINT IF EXISTS agency_payments_tds_nonnegative_chk,
  ADD CONSTRAINT agency_payments_tds_nonnegative_chk CHECK (tds_deducted >= 0);

ALTER TABLE agency_invoice_payments
  DROP CONSTRAINT IF EXISTS agency_payments_other_nonnegative_chk,
  ADD CONSTRAINT agency_payments_other_nonnegative_chk CHECK (other_deduction >= 0);
