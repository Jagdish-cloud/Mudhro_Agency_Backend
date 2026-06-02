-- Agency invoice installments: optional per-invoice split into scheduled
-- payments. Sum of installment amounts must equal grand_total (enforced at
-- service layer because CHECK constraints cannot reference other tables).
--
-- Down migration (manual):
--   DROP TABLE IF EXISTS agency_invoice_installments;

CREATE TABLE IF NOT EXISTS agency_invoice_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES agency_invoices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sequence INT NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_installments_status_chk CHECK (
    status IN ('pending', 'paid', 'overdue', 'cancelled')
  ),
  CONSTRAINT agency_installments_amount_positive_chk CHECK (amount > 0),
  CONSTRAINT agency_installments_sequence_nonneg_chk CHECK (sequence >= 1),
  UNIQUE (invoice_id, sequence)
);

CREATE INDEX IF NOT EXISTS agency_installments_org_due_idx
  ON agency_invoice_installments (organization_id, due_date);

CREATE INDEX IF NOT EXISTS agency_installments_invoice_idx
  ON agency_invoice_installments (invoice_id, sequence);
