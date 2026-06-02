-- Per-organization invoice-number sequence table. Allocating a number is an
-- atomic INSERT ... ON CONFLICT DO UPDATE inside the invoice-create
-- transaction so two concurrent requests never collide on (org, year).
--
-- Down migration (manual):
--   DROP TABLE IF EXISTS agency_invoice_sequences;

CREATE TABLE IF NOT EXISTS agency_invoice_sequences (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  year INT NOT NULL,
  next_number INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, year),
  CONSTRAINT agency_invoice_sequences_year_chk CHECK (year >= 2000 AND year <= 2999),
  CONSTRAINT agency_invoice_sequences_next_nonneg_chk CHECK (next_number >= 1)
);
