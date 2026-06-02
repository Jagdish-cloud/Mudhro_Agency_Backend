-- Blob file registry + signature storage container name (for legacy path support).

ALTER TABLE agency_agreement_signatures
  ADD COLUMN IF NOT EXISTS blob_container TEXT NULL;

CREATE TABLE IF NOT EXISTS agency_blob_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_kind TEXT NOT NULL,
  project_id UUID NULL REFERENCES agency_projects(id) ON DELETE SET NULL,
  client_id UUID NULL REFERENCES agency_clients(id) ON DELETE SET NULL,
  agreement_id UUID NULL REFERENCES agency_agreements(id) ON DELETE SET NULL,
  container_name TEXT NOT NULL,
  blob_path TEXT NOT NULL,
  original_filename TEXT NULL,
  content_type TEXT NULL,
  byte_size BIGINT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT agency_blob_files_kind_chk CHECK (
    file_kind IN (
      'service_provider_signature',
      'client_signature',
      'agreement_pdf',
      'other'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS agency_blob_files_org_path_active_uidx
  ON agency_blob_files (organization_id, blob_path)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agency_blob_files_org_created_idx
  ON agency_blob_files (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agency_blob_files_org_project_idx
  ON agency_blob_files (organization_id, project_id)
  WHERE deleted_at IS NULL AND project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS agency_blob_files_org_client_idx
  ON agency_blob_files (organization_id, client_id)
  WHERE deleted_at IS NULL AND client_id IS NOT NULL;
