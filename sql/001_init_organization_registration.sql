CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  gst_number VARCHAR(15),
  is_unregistered BOOLEAN NOT NULL DEFAULT FALSE,
  company_pan VARCHAR(10) NOT NULL,
  company_mobile VARCHAR(10) NOT NULL,
  company_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organizations_company_pan_format_chk CHECK (company_pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]{1}$'),
  CONSTRAINT organizations_company_mobile_format_chk CHECK (company_mobile ~ '^[6-9][0-9]{9}$'),
  CONSTRAINT organizations_gst_format_chk CHECK (
    gst_number IS NULL OR gst_number ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{3}$'
  ),
  CONSTRAINT organizations_gst_conditional_chk CHECK (
    (is_unregistered = TRUE AND gst_number IS NULL)
    OR (is_unregistered = FALSE AND gst_number IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS organization_contact_persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  number VARCHAR(10) NOT NULL,
  designation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_contact_persons_mobile_format_chk CHECK (number ~ '^[6-9][0-9]{9}$')
);

CREATE TABLE IF NOT EXISTS organization_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  number VARCHAR(10) NOT NULL,
  designation TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_admins_mobile_format_chk CHECK (number ~ '^[6-9][0-9]{9}$'),
  CONSTRAINT organization_admins_org_email_unique UNIQUE (organization_id, email)
);

CREATE INDEX IF NOT EXISTS organizations_company_email_idx
  ON organizations (company_email);

CREATE INDEX IF NOT EXISTS organization_admins_organization_id_idx
  ON organization_admins (organization_id);

CREATE INDEX IF NOT EXISTS organization_contact_persons_organization_id_idx
  ON organization_contact_persons (organization_id);
