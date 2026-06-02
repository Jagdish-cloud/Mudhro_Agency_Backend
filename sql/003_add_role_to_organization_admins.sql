-- Adds role-based access to organization_admins, along with status and soft-delete.
-- Run after 002_admin_email_globally_unique.sql.
--
-- Role mapping:
--   1 = Admin  (full manage access inside their organization)
--   2 = Member (restricted / read-only)
--
-- Down migration (manual, destructive):
--   DROP INDEX IF EXISTS organization_admins_org_role_idx;
--   ALTER TABLE organization_admins
--     DROP CONSTRAINT IF EXISTS organization_admins_status_check,
--     DROP CONSTRAINT IF EXISTS organization_admins_role_check,
--     DROP COLUMN IF EXISTS deleted_at,
--     DROP COLUMN IF EXISTS status,
--     DROP COLUMN IF EXISTS role;

ALTER TABLE organization_admins
  ADD COLUMN IF NOT EXISTS role INTEGER NOT NULL DEFAULT 2;

-- Every existing row was created through the organization registration flow,
-- which always seeded the first organization admin. Backfill accordingly.
UPDATE organization_admins SET role = 1 WHERE role = 2;

ALTER TABLE organization_admins
  DROP CONSTRAINT IF EXISTS organization_admins_role_check;

ALTER TABLE organization_admins
  ADD CONSTRAINT organization_admins_role_check CHECK (role IN (1, 2));

ALTER TABLE organization_admins
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE organization_admins
  DROP CONSTRAINT IF EXISTS organization_admins_status_check;

ALTER TABLE organization_admins
  ADD CONSTRAINT organization_admins_status_check CHECK (status IN ('active', 'inactive'));

ALTER TABLE organization_admins
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS organization_admins_org_role_idx
  ON organization_admins (organization_id, role)
  WHERE deleted_at IS NULL;
