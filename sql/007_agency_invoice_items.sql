-- Agency invoice line items. HSN code is REQUIRED for every line (agency GST
-- requirement). organization_id is denormalized on every row so queries can
-- filter by org without always joining the invoices table.
--
-- Down migration (manual):
--   DROP TABLE IF EXISTS agency_invoice_items;

CREATE TABLE IF NOT EXISTS agency_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES agency_invoices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  item_name TEXT NOT NULL,
  description TEXT NULL,
  hsn_code TEXT NOT NULL,
  qty NUMERIC(12, 3) NOT NULL,
  rate NUMERIC(14, 2) NOT NULL,
  discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  tax_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  line_subtotal NUMERIC(14, 2) NOT NULL,
  cgst_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sgst_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  igst_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_invoice_items_hsn_nonempty_chk CHECK (length(trim(hsn_code)) > 0),
  CONSTRAINT agency_invoice_items_qty_positive_chk CHECK (qty > 0),
  CONSTRAINT agency_invoice_items_rate_nonneg_chk CHECK (rate >= 0),
  CONSTRAINT agency_invoice_items_discount_range_chk CHECK (
    discount_percent >= 0 AND discount_percent <= 100
  ),
  CONSTRAINT agency_invoice_items_tax_range_chk CHECK (
    tax_percent >= 0 AND tax_percent <= 100
  )
);

CREATE INDEX IF NOT EXISTS agency_invoice_items_invoice_idx
  ON agency_invoice_items (invoice_id, position);

CREATE INDEX IF NOT EXISTS agency_invoice_items_org_idx
  ON agency_invoice_items (organization_id);
