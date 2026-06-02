-- Junction table between agency_projects and agency_clients (many-to-many).
-- One client may participate in many projects, and one project may have many
-- clients (multiple billing parties on a single engagement).
--
-- Notes:
-- * organization_id is denormalized for fast org-scoped filtering and to
--   short-circuit cross-org joins. A trigger enforces consistency with both
--   the project's and the client's organization_id.
-- * (project_id, client_id) is unique; bulk-replace flow in the service layer
--   relies on this.
--
-- Down migration (manual, destructive):
--   DROP TABLE IF EXISTS agency_project_clients CASCADE;

CREATE TABLE IF NOT EXISTS agency_project_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES agency_projects(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_project_clients_unique UNIQUE (project_id, client_id)
);

CREATE INDEX IF NOT EXISTS agency_project_clients_project_idx
  ON agency_project_clients (project_id);

CREATE INDEX IF NOT EXISTS agency_project_clients_client_idx
  ON agency_project_clients (client_id);

CREATE INDEX IF NOT EXISTS agency_project_clients_org_project_idx
  ON agency_project_clients (organization_id, project_id);

-- Enforce that the linked project and client both belong to the same
-- organization as the row's organization_id. This is a defence in depth net
-- on top of the service-layer checks.
CREATE OR REPLACE FUNCTION agency_project_clients_assert_org()
RETURNS TRIGGER AS $$
DECLARE
  project_org UUID;
  client_org UUID;
BEGIN
  SELECT organization_id INTO project_org
  FROM agency_projects
  WHERE id = NEW.project_id;

  IF project_org IS NULL THEN
    RAISE EXCEPTION 'agency_project_clients: project % does not exist', NEW.project_id;
  END IF;

  IF project_org <> NEW.organization_id THEN
    RAISE EXCEPTION
      'agency_project_clients: project % belongs to a different organization', NEW.project_id;
  END IF;

  SELECT organization_id INTO client_org
  FROM agency_clients
  WHERE id = NEW.client_id;

  IF client_org IS NULL THEN
    RAISE EXCEPTION 'agency_project_clients: client % does not exist', NEW.client_id;
  END IF;

  IF client_org <> NEW.organization_id THEN
    RAISE EXCEPTION
      'agency_project_clients: client % belongs to a different organization', NEW.client_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agency_project_clients_org_trg ON agency_project_clients;
CREATE TRIGGER agency_project_clients_org_trg
BEFORE INSERT OR UPDATE OF project_id, client_id, organization_id ON agency_project_clients
FOR EACH ROW EXECUTE FUNCTION agency_project_clients_assert_org();
