-- Agency agreements and their child entities. One agency_project owns at
-- most one agreement (1:1 enforced via UNIQUE on project_id).
--
-- Layout (six tables in this single migration, mirroring the
-- 011_agency_attachments_and_notifications precedent):
--   agency_agreements                  - top-level agreement
--   agency_agreement_deliverables      - scope-of-work line items
--   agency_agreement_payment_terms     - 1:1 with agreement, holds structure
--   agency_agreement_payment_milestones- only when structure='milestone-based'
--   agency_agreement_signatures        - service_provider + client signatures
--   agency_agreement_client_links      - per-client signing tokens (48h TTL)
--
-- Down migration (manual, destructive):
--   DROP TABLE IF EXISTS agency_agreement_client_links CASCADE;
--   DROP TABLE IF EXISTS agency_agreement_signatures CASCADE;
--   DROP TABLE IF EXISTS agency_agreement_payment_milestones CASCADE;
--   DROP TABLE IF EXISTS agency_agreement_payment_terms CASCADE;
--   DROP TABLE IF EXISTS agency_agreement_deliverables CASCADE;
--   DROP TABLE IF EXISTS agency_agreements CASCADE;

CREATE TABLE IF NOT EXISTS agency_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL UNIQUE REFERENCES agency_projects(id) ON DELETE CASCADE,
  service_provider_name TEXT NOT NULL,
  agreement_date DATE NOT NULL,
  service_type TEXT NOT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  duration INTEGER NULL,
  duration_unit TEXT NULL,
  number_of_revisions INTEGER NOT NULL DEFAULT 0,
  jurisdiction TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  document_id TEXT NULL,
  created_by_org_user_id UUID NULL REFERENCES organization_admins(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT agency_agreements_status_chk CHECK (
    status IN ('draft', 'pending', 'completed')
  ),
  CONSTRAINT agency_agreements_duration_unit_chk CHECK (
    duration_unit IS NULL OR duration_unit IN ('days', 'weeks', 'months')
  ),
  CONSTRAINT agency_agreements_revisions_chk CHECK (number_of_revisions >= 0),
  CONSTRAINT agency_agreements_dates_chk CHECK (
    end_date IS NULL OR start_date IS NULL OR end_date >= start_date
  )
);

CREATE INDEX IF NOT EXISTS agency_agreements_org_idx
  ON agency_agreements (organization_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agency_agreements_project_idx
  ON agency_agreements (project_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agency_agreements_org_status_idx
  ON agency_agreements (organization_id, status)
  WHERE deleted_at IS NULL;

-- Enforce that the agreement's project belongs to the same organization.
CREATE OR REPLACE FUNCTION agency_agreements_assert_project_org()
RETURNS TRIGGER AS $$
DECLARE
  project_org UUID;
BEGIN
  SELECT organization_id INTO project_org
  FROM agency_projects
  WHERE id = NEW.project_id;

  IF project_org IS NULL THEN
    RAISE EXCEPTION 'agency_agreements: project % does not exist', NEW.project_id;
  END IF;

  IF project_org <> NEW.organization_id THEN
    RAISE EXCEPTION
      'agency_agreements: project % belongs to a different organization', NEW.project_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agency_agreements_project_org_trg ON agency_agreements;
CREATE TRIGGER agency_agreements_project_org_trg
BEFORE INSERT OR UPDATE OF project_id, organization_id ON agency_agreements
FOR EACH ROW EXECUTE FUNCTION agency_agreements_assert_project_org();

-- Deliverables (scope of work line items).
CREATE TABLE IF NOT EXISTS agency_agreement_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES agency_agreements(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agency_agreement_deliverables_agreement_idx
  ON agency_agreement_deliverables (agreement_id, sort_order);

-- Payment terms (1:1 with agreement).
CREATE TABLE IF NOT EXISTS agency_agreement_payment_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL UNIQUE REFERENCES agency_agreements(id) ON DELETE CASCADE,
  payment_structure TEXT NOT NULL,
  payment_method TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_agreement_payment_terms_structure_chk CHECK (
    payment_structure IN ('50-50', '100-upfront', '100-completion', 'milestone-based')
  )
);

-- Payment milestones (only present when payment_structure='milestone-based').
CREATE TABLE IF NOT EXISTS agency_agreement_payment_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_payment_term_id UUID NOT NULL REFERENCES agency_agreement_payment_terms(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  milestone_date DATE NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_agreement_payment_milestones_status_chk CHECK (
    status IN ('pending', 'created')
  ),
  CONSTRAINT agency_agreement_payment_milestones_amount_chk CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS agency_agreement_payment_milestones_term_idx
  ON agency_agreement_payment_milestones (agreement_payment_term_id, sort_order);

-- Signatures (one per signer; service_provider + each client).
CREATE TABLE IF NOT EXISTS agency_agreement_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES agency_agreements(id) ON DELETE CASCADE,
  signer_type TEXT NOT NULL,
  client_id UUID NULL REFERENCES agency_clients(id) ON DELETE SET NULL,
  signer_name TEXT NOT NULL,
  signature_image_name TEXT NULL,
  signature_image_path TEXT NULL,
  ip_address TEXT NULL,
  document_id TEXT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_agreement_signatures_signer_type_chk CHECK (
    signer_type IN ('service_provider', 'client')
  ),
  CONSTRAINT agency_agreement_signatures_client_chk CHECK (
    (signer_type = 'service_provider' AND client_id IS NULL)
    OR (signer_type = 'client' AND client_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS agency_agreement_signatures_agreement_idx
  ON agency_agreement_signatures (agreement_id);

CREATE INDEX IF NOT EXISTS agency_agreement_signatures_agreement_type_idx
  ON agency_agreement_signatures (agreement_id, signer_type);

-- Client signing links (one per client per agreement). Token is opaque hex
-- generated at the application layer (crypto.randomBytes(32)).
CREATE TABLE IF NOT EXISTS agency_agreement_client_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES agency_agreements(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  email_sent_at TIMESTAMPTZ NULL,
  signed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_agreement_client_links_status_chk CHECK (
    status IN ('pending', 'client_signed', 'expired')
  ),
  CONSTRAINT agency_agreement_client_links_unique UNIQUE (agreement_id, client_id)
);

CREATE INDEX IF NOT EXISTS agency_agreement_client_links_token_idx
  ON agency_agreement_client_links (token);

CREATE INDEX IF NOT EXISTS agency_agreement_client_links_agreement_status_idx
  ON agency_agreement_client_links (agreement_id, status);
