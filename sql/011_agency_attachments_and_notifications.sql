-- Agency invoice attachments (uploaded supporting documents) and org-wide
-- notifications. Both are strictly organization-scoped.
--
-- Files are stored on local disk under UPLOAD_DIR/orgs/:orgId/invoices/:id/.
-- The DB only holds the relative storage_path; the service layer resolves
-- the absolute path and prevents directory traversal.
--
-- Down migration (manual):
--   DROP TABLE IF EXISTS agency_invoice_attachments;
--   DROP TABLE IF EXISTS agency_notifications;

CREATE TABLE IF NOT EXISTS agency_invoice_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES agency_invoices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_by_org_user_id UUID NOT NULL REFERENCES organization_admins(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_attachments_size_positive_chk CHECK (size_bytes > 0)
);

CREATE INDEX IF NOT EXISTS agency_attachments_invoice_idx
  ON agency_invoice_attachments (invoice_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agency_attachments_org_idx
  ON agency_invoice_attachments (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agency_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NULL REFERENCES organization_admins(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  related_entity_type TEXT NULL,
  related_entity_id UUID NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_notifications_severity_chk CHECK (
    severity IN ('info', 'warning', 'critical')
  )
);

CREATE INDEX IF NOT EXISTS agency_notifications_org_created_idx
  ON agency_notifications (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agency_notifications_user_unread_idx
  ON agency_notifications (user_id, is_read, created_at DESC);
