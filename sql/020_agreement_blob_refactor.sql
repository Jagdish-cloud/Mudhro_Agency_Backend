-- Final signed PDF lives on agency_agreements. Generic uploads use agency_project_files.
-- Drops agency_blob_files (duplicate registry for signatures/PDF).

ALTER TABLE agency_agreements
  ADD COLUMN IF NOT EXISTS final_pdf_blob_path TEXT NULL,
  ADD COLUMN IF NOT EXISTS final_pdf_blob_container TEXT NULL,
  ADD COLUMN IF NOT EXISTS final_pdf_byte_size BIGINT NULL,
  ADD COLUMN IF NOT EXISTS final_pdf_content_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS final_pdf_uploaded_at TIMESTAMPTZ NULL;

CREATE TABLE IF NOT EXISTS agency_project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES agency_projects(id) ON DELETE SET NULL,
  client_id UUID NULL REFERENCES agency_clients(id) ON DELETE SET NULL,
  agreement_id UUID NULL REFERENCES agency_agreements(id) ON DELETE SET NULL,
  container_name TEXT NOT NULL,
  blob_path TEXT NOT NULL,
  original_filename TEXT NULL,
  content_type TEXT NULL,
  byte_size BIGINT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS agency_project_files_org_path_active_uidx
  ON agency_project_files (organization_id, blob_path)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agency_project_files_org_created_idx
  ON agency_project_files (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agency_project_files_org_project_idx
  ON agency_project_files (organization_id, project_id)
  WHERE deleted_at IS NULL AND project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS agency_project_files_org_client_idx
  ON agency_project_files (organization_id, client_id)
  WHERE deleted_at IS NULL AND client_id IS NOT NULL;

DROP TABLE IF EXISTS agency_blob_files;
