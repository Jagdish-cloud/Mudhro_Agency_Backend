-- Agency invoices (organization-scoped).
--
-- Design notes:
-- * organization_id is required on every row; ALL queries must filter on it.
-- * client_id must belong to the same organization. This is enforced both
--   in code (service layer) and via a DEFERRABLE constraint trigger below.
-- * created_by_org_user_id (FK) is the source of truth for creator attribution.
--   created_by_name / created_by_email are denormalized convenience fields
--   and MUST NEVER be overwritten by updates.
-- * portal_token is a unique opaque UUID used by the public client-portal
--   view; rotating it effectively revokes the share link.
--
-- Down migration (manual, destructive):
--   DROP TABLE IF EXISTS agency_invoices CASCADE;

CREATE TABLE IF NOT EXISTS agency_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  project_id UUID NULL,
  invoice_number TEXT NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'draft',
  payment_terms TEXT NULL,
  notes TEXT NULL,
  place_of_supply VARCHAR(2) NULL,
  subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  cgst_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sgst_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  igst_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  amount_received NUMERIC(14, 2) NOT NULL DEFAULT 0,
  amount_pending NUMERIC(14, 2) NOT NULL DEFAULT 0,
  portal_token UUID NOT NULL DEFAULT gen_random_uuid(),
  sent_at TIMESTAMPTZ NULL,
  viewed_at TIMESTAMPTZ NULL,
  created_by_org_user_id UUID NOT NULL REFERENCES organization_admins(id) ON DELETE RESTRICT,
  created_by_name TEXT NOT NULL,
  created_by_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT agency_invoices_status_chk CHECK (
    status IN ('draft', 'sent', 'viewed', 'paid', 'partial', 'overdue', 'cancelled')
  ),
  CONSTRAINT agency_invoices_currency_chk CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT agency_invoices_due_after_issue_chk CHECK (due_date >= issue_date),
  CONSTRAINT agency_invoices_nonneg_chk CHECK (
    subtotal >= 0 AND discount_total >= 0 AND tax_total >= 0
      AND grand_total >= 0 AND amount_received >= 0 AND amount_pending >= 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS agency_invoices_org_number_unique
  ON agency_invoices (organization_id, invoice_number)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agency_invoices_portal_token_unique
  ON agency_invoices (portal_token);

CREATE INDEX IF NOT EXISTS agency_invoices_org_created_idx
  ON agency_invoices (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agency_invoices_org_status_idx
  ON agency_invoices (organization_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agency_invoices_org_client_idx
  ON agency_invoices (organization_id, client_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agency_invoices_org_due_idx
  ON agency_invoices (organization_id, due_date)
  WHERE deleted_at IS NULL;

-- Enforce client/invoice org consistency at the database layer as a safety
-- net; the service layer is the primary enforcement point.
CREATE OR REPLACE FUNCTION agency_invoices_assert_client_org()
RETURNS TRIGGER AS $$
DECLARE
  client_org UUID;
BEGIN
  SELECT organization_id INTO client_org
  FROM agency_clients
  WHERE id = NEW.client_id;

  IF client_org IS NULL THEN
    RAISE EXCEPTION 'agency_invoices: client % does not exist', NEW.client_id;
  END IF;

  IF client_org <> NEW.organization_id THEN
    RAISE EXCEPTION
      'agency_invoices: client % belongs to a different organization', NEW.client_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agency_invoices_client_org_trg ON agency_invoices;
CREATE TRIGGER agency_invoices_client_org_trg
BEFORE INSERT OR UPDATE OF client_id, organization_id ON agency_invoices
FOR EACH ROW EXECUTE FUNCTION agency_invoices_assert_client_org();
