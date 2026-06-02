-- Adds an "amounts inclusive of tax" flag to agency_invoices.
--
-- When TRUE, line item rates entered on the invoice are treated as gross
-- (tax-included) figures and the net subtotal is back-calculated as
--     net = gross / (1 + taxPercent / 100)
-- before tax/CGST/SGST/IGST are recomputed. Existing invoices default to
-- FALSE so historical totals are unaffected.
--
-- Down migration (manual, destructive):
--   ALTER TABLE agency_invoices DROP COLUMN amounts_inclusive_of_tax;

ALTER TABLE agency_invoices
  ADD COLUMN IF NOT EXISTS amounts_inclusive_of_tax BOOLEAN NOT NULL DEFAULT FALSE;
