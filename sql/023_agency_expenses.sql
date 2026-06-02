-- Agency expenses (organization-scoped): catalog services, expense bills, line items.
--
-- Down migration (manual, destructive):
--   DROP TABLE IF EXISTS agency_expense_items CASCADE;
--   DROP TABLE IF EXISTS agency_expenses CASCADE;
--   DROP TABLE IF EXISTS agency_expense_services CASCADE;
--   DROP SEQUENCE IF EXISTS agency_expense_bill_number_seq CASCADE;

CREATE SEQUENCE IF NOT EXISTS agency_expense_bill_number_seq;

CREATE OR REPLACE FUNCTION generate_agency_expense_bill_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'BILL' || to_char(nextval('agency_expense_bill_number_seq'), 'FM00000');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION agency_expenses_assign_bill_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.bill_number IS NULL OR trim(NEW.bill_number) = '' THEN
    NEW.bill_number := generate_agency_expense_bill_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION agency_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS agency_expense_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  default_rate NUMERIC(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_expense_services_name_nonempty_chk CHECK (length(trim(name)) > 0),
  CONSTRAINT agency_expense_services_default_rate_nonneg_chk CHECK (default_rate >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS agency_expense_services_org_name_unique
  ON agency_expense_services (organization_id, lower(trim(name)));

CREATE INDEX IF NOT EXISTS agency_expense_services_org_idx
  ON agency_expense_services (organization_id, created_at DESC);

DROP TRIGGER IF EXISTS agency_expense_services_updated_trg ON agency_expense_services;
CREATE TRIGGER agency_expense_services_updated_trg
BEFORE UPDATE ON agency_expense_services
FOR EACH ROW EXECUTE FUNCTION agency_touch_updated_at();

CREATE TABLE IF NOT EXISTS agency_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  project_id UUID NULL REFERENCES agency_projects(id) ON DELETE RESTRICT,
  bill_number VARCHAR(20) NULL,
  bill_date DATE NOT NULL,
  due_date DATE NOT NULL,
  tax_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0,
  sub_total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  attachment_file_name VARCHAR(255) NULL,
  expense_file_name VARCHAR(255) NULL,
  additional_notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_expenses_due_after_bill_chk CHECK (due_date >= bill_date),
  CONSTRAINT agency_expenses_tax_range_chk CHECK (tax_percentage >= 0 AND tax_percentage <= 100),
  CONSTRAINT agency_expenses_amounts_nonneg_chk CHECK (sub_total_amount >= 0 AND total_amount >= 0),
  CONSTRAINT agency_expenses_bill_number_len_chk CHECK (
    bill_number IS NULL OR length(bill_number) <= 20
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS agency_expenses_org_bill_unique
  ON agency_expenses (organization_id, bill_number)
  WHERE bill_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS agency_expenses_org_bill_date_idx
  ON agency_expenses (organization_id, bill_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS agency_expenses_org_client_idx
  ON agency_expenses (organization_id, client_id);

CREATE INDEX IF NOT EXISTS agency_expenses_org_project_idx
  ON agency_expenses (organization_id, project_id)
  WHERE project_id IS NOT NULL;

DROP TRIGGER IF EXISTS agency_expenses_bill_number_trg ON agency_expenses;
CREATE TRIGGER agency_expenses_bill_number_trg
BEFORE INSERT OR UPDATE OF bill_number ON agency_expenses
FOR EACH ROW EXECUTE FUNCTION agency_expenses_assign_bill_number();

DROP TRIGGER IF EXISTS agency_expenses_updated_trg ON agency_expenses;
CREATE TRIGGER agency_expenses_updated_trg
BEFORE UPDATE ON agency_expenses
FOR EACH ROW EXECUTE FUNCTION agency_touch_updated_at();

CREATE OR REPLACE FUNCTION agency_expenses_assert_client_org()
RETURNS TRIGGER AS $$
DECLARE
  client_org UUID;
BEGIN
  SELECT organization_id INTO client_org
  FROM agency_clients
  WHERE id = NEW.client_id AND deleted_at IS NULL;

  IF client_org IS NULL THEN
    RAISE EXCEPTION 'agency_expenses: client % does not exist or is deleted', NEW.client_id;
  END IF;

  IF client_org <> NEW.organization_id THEN
    RAISE EXCEPTION
      'agency_expenses: client % belongs to a different organization', NEW.client_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agency_expenses_client_org_trg ON agency_expenses;
CREATE TRIGGER agency_expenses_client_org_trg
BEFORE INSERT OR UPDATE OF client_id, organization_id ON agency_expenses
FOR EACH ROW EXECUTE FUNCTION agency_expenses_assert_client_org();

CREATE OR REPLACE FUNCTION agency_expenses_assert_project_org()
RETURNS TRIGGER AS $$
DECLARE
  proj_org UUID;
BEGIN
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT organization_id INTO proj_org
  FROM agency_projects
  WHERE id = NEW.project_id AND deleted_at IS NULL;

  IF proj_org IS NULL THEN
    RAISE EXCEPTION 'agency_expenses: project % does not exist or is deleted', NEW.project_id;
  END IF;

  IF proj_org <> NEW.organization_id THEN
    RAISE EXCEPTION
      'agency_expenses: project % belongs to a different organization', NEW.project_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agency_expenses_project_org_trg ON agency_expenses;
CREATE TRIGGER agency_expenses_project_org_trg
BEFORE INSERT OR UPDATE OF project_id, organization_id ON agency_expenses
FOR EACH ROW EXECUTE FUNCTION agency_expenses_assert_project_org();

CREATE TABLE IF NOT EXISTS agency_expense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES agency_expenses(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES agency_expense_services(id) ON DELETE RESTRICT,
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_expense_items_qty_pos_chk CHECK (quantity > 0),
  CONSTRAINT agency_expense_items_unit_price_nonneg_chk CHECK (unit_price >= 0)
);

CREATE INDEX IF NOT EXISTS agency_expense_items_expense_idx
  ON agency_expense_items (expense_id);

CREATE INDEX IF NOT EXISTS agency_expense_items_service_idx
  ON agency_expense_items (service_id);

DROP TRIGGER IF EXISTS agency_expense_items_updated_trg ON agency_expense_items;
CREATE TRIGGER agency_expense_items_updated_trg
BEFORE UPDATE ON agency_expense_items
FOR EACH ROW EXECUTE FUNCTION agency_touch_updated_at();

CREATE OR REPLACE FUNCTION agency_expense_items_assert_service_org()
RETURNS TRIGGER AS $$
DECLARE
  exp_org UUID;
  svc_org UUID;
BEGIN
  SELECT organization_id INTO exp_org FROM agency_expenses WHERE id = NEW.expense_id;
  IF exp_org IS NULL THEN
    RAISE EXCEPTION 'agency_expense_items: expense % does not exist', NEW.expense_id;
  END IF;

  SELECT organization_id INTO svc_org FROM agency_expense_services WHERE id = NEW.service_id;
  IF svc_org IS NULL THEN
    RAISE EXCEPTION 'agency_expense_items: service % does not exist', NEW.service_id;
  END IF;

  IF exp_org <> svc_org THEN
    RAISE EXCEPTION 'agency_expense_items: service and expense organization mismatch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agency_expense_items_service_org_trg ON agency_expense_items;
CREATE TRIGGER agency_expense_items_service_org_trg
BEFORE INSERT OR UPDATE OF expense_id, service_id ON agency_expense_items
FOR EACH ROW EXECUTE FUNCTION agency_expense_items_assert_service_org();
