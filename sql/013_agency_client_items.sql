-- Per-client catalog of reusable line items. These are NOT the invoice line
-- items themselves (those live in agency_invoice_items) -- these are templates
-- scoped to a client that power the "Add from catalog" dropdown and the
-- per-row "Save to catalog" button in the Invoice Builder.
--
-- Design notes:
-- * organization_id is required on every row; ALL queries must filter on it.
-- * client_id must belong to the same organization. This is enforced both
--   in code (service layer) and via a trigger (mirrors agency_invoices).
-- * Unique live index on (organization_id, client_id, lower(item_name),
--   hsn_code) prevents duplicates within a client's catalog but still allows
--   reuse of the same name/hsn after a soft delete.
--
-- Down migration (manual, destructive):
--   DROP TABLE IF EXISTS agency_client_items CASCADE;

CREATE TABLE IF NOT EXISTS agency_client_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  description TEXT NULL,
  hsn_code TEXT NOT NULL,
  default_rate NUMERIC(14, 2) NOT NULL DEFAULT 0,
  default_tax_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  default_discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  unit TEXT NULL,
  created_by_org_user_id UUID NULL REFERENCES organization_admins(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT agency_client_items_name_nonempty_chk CHECK (length(trim(item_name)) > 0),
  CONSTRAINT agency_client_items_hsn_nonempty_chk CHECK (length(trim(hsn_code)) > 0),
  CONSTRAINT agency_client_items_rate_nonneg_chk CHECK (default_rate >= 0),
  CONSTRAINT agency_client_items_tax_range_chk CHECK (
    default_tax_percent >= 0 AND default_tax_percent <= 100
  ),
  CONSTRAINT agency_client_items_disc_range_chk CHECK (
    default_discount_percent >= 0 AND default_discount_percent <= 100
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS agency_client_items_unique_live_idx
  ON agency_client_items (organization_id, client_id, lower(item_name), hsn_code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agency_client_items_client_idx
  ON agency_client_items (organization_id, client_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agency_client_items_updated_idx
  ON agency_client_items (organization_id, client_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- Same-org safety net (mirrors agency_invoices_assert_client_org).
CREATE OR REPLACE FUNCTION agency_client_items_assert_client_org()
RETURNS TRIGGER AS $$
DECLARE
  client_org UUID;
BEGIN
  SELECT organization_id INTO client_org
  FROM agency_clients
  WHERE id = NEW.client_id;

  IF client_org IS NULL THEN
    RAISE EXCEPTION 'agency_client_items: client % does not exist', NEW.client_id;
  END IF;

  IF client_org <> NEW.organization_id THEN
    RAISE EXCEPTION
      'agency_client_items: client % belongs to a different organization', NEW.client_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agency_client_items_client_org_trg ON agency_client_items;
CREATE TRIGGER agency_client_items_client_org_trg
BEFORE INSERT OR UPDATE OF client_id, organization_id ON agency_client_items
FOR EACH ROW EXECUTE FUNCTION agency_client_items_assert_client_org();
