-- Agency billing clients (organization-scoped). Not the same as
-- organization_contact_persons (internal contacts of the org itself).
--
-- Client uniqueness is NOT enforced globally; the same name/email/gst may
-- legitimately exist across multiple organizations. Any future uniqueness
-- MUST be scoped to (organization_id, ...).
--
-- Down migration (manual, destructive):
--   DROP TABLE IF EXISTS agency_clients;

CREATE TABLE IF NOT EXISTS agency_clients (
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
  CONSTRAINT agency_clients_status_chk CHECK (status IN ('active', 'inactive', 'archived')),
  CONSTRAINT agency_clients_gst_format_chk CHECK (
    gst_number IS NULL OR gst_number ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{3}$'
  ),
  CONSTRAINT agency_clients_pan_format_chk CHECK (
    pan_number IS NULL OR pan_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]{1}$'
  )
);

CREATE INDEX IF NOT EXISTS agency_clients_org_created_idx
  ON agency_clients (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agency_clients_org_name_idx
  ON agency_clients (organization_id, lower(name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agency_clients_org_email_idx
  ON agency_clients (organization_id, lower(email))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agency_clients_org_status_idx
  ON agency_clients (organization_id, status)
  WHERE deleted_at IS NULL;
