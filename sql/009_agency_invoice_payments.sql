-- Agency invoice payments (money actually received). Applying a payment to
-- a specific installment is optional (installment_id NULL = ad-hoc payment
-- applied to the invoice total).
--
-- The service layer is responsible for updating amount_received /
-- amount_pending / status on the parent invoice and installment rows.
--
-- Down migration (manual):
--   DROP TABLE IF EXISTS agency_invoice_payments;

CREATE TABLE IF NOT EXISTS agency_invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES agency_invoices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  installment_id UUID NULL REFERENCES agency_invoice_installments(id) ON DELETE SET NULL,
  amount NUMERIC(14, 2) NOT NULL,
  method TEXT NOT NULL DEFAULT 'other',
  reference TEXT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT NULL,
  recorded_by_org_user_id UUID NOT NULL REFERENCES organization_admins(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_payments_amount_positive_chk CHECK (amount > 0),
  CONSTRAINT agency_payments_method_chk CHECK (
    method IN ('cash', 'upi', 'bank_transfer', 'card', 'cheque', 'other')
  )
);

CREATE INDEX IF NOT EXISTS agency_payments_invoice_idx
  ON agency_invoice_payments (invoice_id, received_at DESC);

CREATE INDEX IF NOT EXISTS agency_payments_org_received_idx
  ON agency_invoice_payments (organization_id, received_at DESC);
