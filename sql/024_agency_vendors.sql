-- Agency vendors (organization-scoped), separate from agency_clients (billing).
-- Per-vendor catalog agency_vendor_items mirrors invoice client item templates for expenses.
-- Migrates agency_expenses.client_id -> vendor_id.
--
-- Down migration (manual, destructive):
--   Requires restoring client_id on agency_expenses from vendors — not automated.
--   DROP TRIGGER IF EXISTS agency_vendor_items_vendor_org_trg ON agency_vendor_items;
--   DROP FUNCTION IF EXISTS agency_vendor_items_assert_vendor_org();
--   DROP TABLE IF EXISTS agency_vendor_items CASCADE;
--   ALTER TABLE agency_expenses DROP CONSTRAINT IF EXISTS agency_expenses_vendor_id_fkey;
--   ALTER TABLE agency_expenses DROP COLUMN IF EXISTS vendor_id;
--   ALTER TABLE agency_expenses ADD COLUMN client_id UUID REFERENCES agency_clients(id);
--   ... restore data manually ...
--   DROP TABLE IF EXISTS agency_vendors CASCADE;

CREATE TABLE IF NOT EXISTS agency_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone VARCHAR(15) NOT NULL DEFAULT '',
  billing_address TEXT NOT NULL DEFAULT '',
  gst_number VARCHAR(15) NULL,
  pan_number VARCHAR(10) NULL,
  state_code VARCHAR(2) NULL,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_by_org_user_id UUID NULL REFERENCES organization_admins(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT agency_vendors_status_chk CHECK (status IN ('active', 'inactive', 'archived')),
  CONSTRAINT agency_vendors_gst_format_chk CHECK (
    gst_number IS NULL OR gst_number ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{3}$'
  ),
  CONSTRAINT agency_vendors_pan_format_chk CHECK (
    pan_number IS NULL OR pan_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]{1}$'
  )
);

CREATE INDEX IF NOT EXISTS agency_vendors_org_created_idx
  ON agency_vendors (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agency_vendors_org_name_idx
  ON agency_vendors (organization_id, lower(name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agency_vendors_org_email_idx
  ON agency_vendors (organization_id, lower(email))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agency_vendors_org_status_idx
  ON agency_vendors (organization_id, status)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS agency_vendors_updated_trg ON agency_vendors;
CREATE TRIGGER agency_vendors_updated_trg
BEFORE UPDATE ON agency_vendors
FOR EACH ROW EXECUTE FUNCTION agency_touch_updated_at();

-- --- Migrate expenses: add vendor_id, backfill, drop client_id ---

ALTER TABLE agency_expenses ADD COLUMN IF NOT EXISTS vendor_id UUID NULL;

-- Map each expense client_id to a new vendor (one vendor per distinct client used).
ALTER TABLE agency_vendors ADD COLUMN IF NOT EXISTS _mig_client_id UUID;

INSERT INTO agency_vendors (
  organization_id,
  name,
  contact_name,
  email,
  phone,
  billing_address,
  gst_number,
  pan_number,
  state_code,
  status,
  notes,
  tags,
  created_by_org_user_id,
  _mig_client_id
)
SELECT DISTINCT ON (s.client_id)
  c.organization_id,
  c.name,
  c.contact_name,
  c.email,
  c.phone,
  c.billing_address,
  c.gst_number,
  c.pan_number,
  c.state_code,
  CASE WHEN c.deleted_at IS NULL THEN c.status ELSE 'archived' END,
  c.notes,
  c.tags,
  c.created_by_org_user_id,
  s.client_id
FROM (SELECT DISTINCT client_id FROM agency_expenses) s
INNER JOIN agency_clients c ON c.id = s.client_id
ORDER BY s.client_id, c.updated_at DESC NULLS LAST;

UPDATE agency_expenses e
SET vendor_id = v.id
FROM agency_vendors v
WHERE v._mig_client_id = e.client_id;

ALTER TABLE agency_vendors DROP COLUMN IF EXISTS _mig_client_id;

DO $verify$
BEGIN
  IF EXISTS (SELECT 1 FROM agency_expenses WHERE vendor_id IS NULL) THEN
    RAISE EXCEPTION '024_agency_vendors: could not map all expenses to vendors (vendor_id NULL)';
  END IF;
END $verify$;

ALTER TABLE agency_expenses ALTER COLUMN vendor_id SET NOT NULL;

ALTER TABLE agency_expenses
  ADD CONSTRAINT agency_expenses_vendor_id_fkey
  FOREIGN KEY (vendor_id) REFERENCES agency_vendors(id) ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS agency_expenses_client_org_trg ON agency_expenses;
DROP FUNCTION IF EXISTS agency_expenses_assert_client_org();

DROP INDEX IF EXISTS agency_expenses_org_client_idx;

ALTER TABLE agency_expenses DROP CONSTRAINT IF EXISTS agency_expenses_client_id_fkey;
ALTER TABLE agency_expenses DROP COLUMN IF EXISTS client_id;

CREATE INDEX IF NOT EXISTS agency_expenses_org_vendor_idx
  ON agency_expenses (organization_id, vendor_id);

CREATE OR REPLACE FUNCTION agency_expenses_assert_vendor_org()
RETURNS TRIGGER AS $$
DECLARE
  v_org UUID;
BEGIN
  SELECT organization_id INTO v_org
  FROM agency_vendors
  WHERE id = NEW.vendor_id AND deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'agency_expenses: vendor % does not exist or is deleted', NEW.vendor_id;
  END IF;

  IF v_org <> NEW.organization_id THEN
    RAISE EXCEPTION
      'agency_expenses: vendor % belongs to a different organization', NEW.vendor_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agency_expenses_vendor_org_trg ON agency_expenses;
CREATE TRIGGER agency_expenses_vendor_org_trg
BEFORE INSERT OR UPDATE OF vendor_id, organization_id ON agency_expenses
FOR EACH ROW EXECUTE FUNCTION agency_expenses_assert_vendor_org();

-- --- Vendor catalog items (expense line templates) ---

CREATE TABLE IF NOT EXISTS agency_vendor_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES agency_vendors(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES agency_expense_services(id) ON DELETE RESTRICT,
  item_name TEXT NOT NULL,
  description TEXT NULL,
  default_quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
  default_rate NUMERIC(15, 2) NOT NULL DEFAULT 0,
  created_by_org_user_id UUID NULL REFERENCES organization_admins(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT agency_vendor_items_name_nonempty_chk CHECK (length(trim(item_name)) > 0),
  CONSTRAINT agency_vendor_items_qty_pos_chk CHECK (default_quantity > 0),
  CONSTRAINT agency_vendor_items_rate_nonneg_chk CHECK (default_rate >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS agency_vendor_items_unique_live_idx
  ON agency_vendor_items (organization_id, vendor_id, lower(trim(item_name)), service_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agency_vendor_items_vendor_idx
  ON agency_vendor_items (organization_id, vendor_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agency_vendor_items_service_idx
  ON agency_vendor_items (organization_id, service_id)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS agency_vendor_items_updated_trg ON agency_vendor_items;
CREATE TRIGGER agency_vendor_items_updated_trg
BEFORE UPDATE ON agency_vendor_items
FOR EACH ROW EXECUTE FUNCTION agency_touch_updated_at();

CREATE OR REPLACE FUNCTION agency_vendor_items_assert_vendor_org()
RETURNS TRIGGER AS $$
DECLARE
  v_org UUID;
BEGIN
  SELECT organization_id INTO v_org
  FROM agency_vendors
  WHERE id = NEW.vendor_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'agency_vendor_items: vendor % does not exist', NEW.vendor_id;
  END IF;

  IF v_org <> NEW.organization_id THEN
    RAISE EXCEPTION
      'agency_vendor_items: vendor % belongs to a different organization', NEW.vendor_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agency_vendor_items_vendor_org_trg ON agency_vendor_items;
CREATE TRIGGER agency_vendor_items_vendor_org_trg
BEFORE INSERT OR UPDATE OF vendor_id, organization_id ON agency_vendor_items
FOR EACH ROW EXECUTE FUNCTION agency_vendor_items_assert_vendor_org();

CREATE OR REPLACE FUNCTION agency_vendor_items_assert_service_org()
RETURNS TRIGGER AS $$
DECLARE
  svc_org UUID;
BEGIN
  SELECT organization_id INTO svc_org
  FROM agency_expense_services
  WHERE id = NEW.service_id;

  IF svc_org IS NULL THEN
    RAISE EXCEPTION 'agency_vendor_items: expense service % does not exist', NEW.service_id;
  END IF;

  IF svc_org <> NEW.organization_id THEN
    RAISE EXCEPTION
      'agency_vendor_items: service % belongs to a different organization', NEW.service_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agency_vendor_items_service_org_trg ON agency_vendor_items;
CREATE TRIGGER agency_vendor_items_service_org_trg
BEFORE INSERT OR UPDATE OF service_id, organization_id ON agency_vendor_items
FOR EACH ROW EXECUTE FUNCTION agency_vendor_items_assert_service_org();
