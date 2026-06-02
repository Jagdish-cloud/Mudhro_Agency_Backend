-- Agency projects (organization-scoped). A project may aggregate multiple
-- agency_clients via the agency_project_clients junction (see 017). One
-- project owns at most one agreement (1:1, see 018).
--
-- Notes:
-- * organization_id is required on every row; ALL queries must filter on it.
-- * created_by_org_user_id is the source of truth for creator attribution.
-- * updated_at is managed in the application layer (no trigger, matching the
--   convention established by agency_clients/agency_invoices).
-- * Soft-delete via deleted_at to allow recovery and to mirror the rest of
--   the agency tables.
--
-- Down migration (manual, destructive):
--   DROP TABLE IF EXISTS agency_projects CASCADE;

CREATE TABLE IF NOT EXISTS agency_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  status TEXT NOT NULL DEFAULT 'active',
  budget NUMERIC(15, 2) NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  created_by_org_user_id UUID NULL REFERENCES organization_admins(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT agency_projects_status_chk CHECK (
    status IN ('active', 'completed', 'on-hold', 'cancelled')
  ),
  CONSTRAINT agency_projects_currency_chk CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT agency_projects_dates_chk CHECK (
    end_date IS NULL OR start_date IS NULL OR end_date >= start_date
  ),
  CONSTRAINT agency_projects_budget_chk CHECK (budget IS NULL OR budget >= 0)
);

CREATE INDEX IF NOT EXISTS agency_projects_org_created_idx
  ON agency_projects (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agency_projects_org_status_idx
  ON agency_projects (organization_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agency_projects_org_name_idx
  ON agency_projects (organization_id, lower(name))
  WHERE deleted_at IS NULL;
