import type { Pool, PoolClient } from "pg";

import type { AgencyClientRow } from "../types/agencyClient.js";

type Executor = Pool | PoolClient;

const CLIENT_COLUMNS = `
  c.id,
  c.organization_id,
  c.name,
  c.contact_name,
  c.email,
  c.phone,
  c.billing_address,
  c.gst_number,
  c.pan_number,
  c.state_code,
  c.status,
  c.notes,
  c.tags,
  c.created_by_org_user_id,
  c.created_at,
  c.updated_at,
  c.deleted_at
`;

export async function listClientsForProject(
  exec: Executor,
  organizationId: string,
  projectId: string,
): Promise<AgencyClientRow[]> {
  const result = await exec.query<AgencyClientRow>(
    `
      SELECT ${CLIENT_COLUMNS}
      FROM agency_project_clients pc
      INNER JOIN agency_clients c ON c.id = pc.client_id
      WHERE pc.organization_id = $1
        AND pc.project_id = $2
        AND c.deleted_at IS NULL
      ORDER BY c.name ASC;
    `,
    [organizationId, projectId],
  );
  return result.rows;
}

export async function listClientIdsForProject(
  exec: Executor,
  organizationId: string,
  projectId: string,
): Promise<string[]> {
  const result = await exec.query<{ client_id: string }>(
    `
      SELECT client_id
      FROM agency_project_clients
      WHERE organization_id = $1 AND project_id = $2;
    `,
    [organizationId, projectId],
  );
  return result.rows.map((r) => r.client_id);
}

/**
 * Bulk-replace the project's client assignments in a single transaction.
 * Removes any rows not in the new set, inserts any missing ones. Returns the
 * canonical set of client ids after the operation.
 */
export async function replaceClientsForProject(
  pool: Pool,
  organizationId: string,
  projectId: string,
  clientIds: string[],
): Promise<string[]> {
  const unique = Array.from(new Set(clientIds));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `
        DELETE FROM agency_project_clients
        WHERE organization_id = $1 AND project_id = $2;
      `,
      [organizationId, projectId],
    );

    if (unique.length > 0) {
      const valuesSql = unique
        .map((_, idx) => `($1, $2, $${idx + 3})`)
        .join(", ");
      await client.query(
        `
          INSERT INTO agency_project_clients (
            organization_id, project_id, client_id
          )
          VALUES ${valuesSql}
          ON CONFLICT (project_id, client_id) DO NOTHING;
        `,
        [organizationId, projectId, ...unique],
      );
    }

    await client.query("COMMIT");
    return unique;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function removeClientFromProject(
  exec: Executor,
  organizationId: string,
  projectId: string,
  clientId: string,
): Promise<boolean> {
  const result = await exec.query(
    `
      DELETE FROM agency_project_clients
      WHERE organization_id = $1 AND project_id = $2 AND client_id = $3;
    `,
    [organizationId, projectId, clientId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function assertClientsBelongToOrg(
  exec: Executor,
  organizationId: string,
  clientIds: string[],
): Promise<{ ok: boolean; missing: string[] }> {
  if (clientIds.length === 0) return { ok: true, missing: [] };
  const result = await exec.query<{ id: string }>(
    `
      SELECT id
      FROM agency_clients
      WHERE organization_id = $1
        AND deleted_at IS NULL
        AND id = ANY($2::uuid[]);
    `,
    [organizationId, clientIds],
  );
  const found = new Set(result.rows.map((r) => r.id));
  const missing = clientIds.filter((id) => !found.has(id));
  return { ok: missing.length === 0, missing };
}
