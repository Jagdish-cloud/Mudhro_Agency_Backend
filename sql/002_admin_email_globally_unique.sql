-- Globally unique admin emails (case-insensitive).
-- Run after 001_init_organization_registration.sql.
-- If this fails, remove duplicate lower(email) rows in organization_admins first.

ALTER TABLE organization_admins
  DROP CONSTRAINT IF EXISTS organization_admins_org_email_unique;

CREATE UNIQUE INDEX IF NOT EXISTS organization_admins_email_lower_unique
  ON organization_admins (lower(email));
