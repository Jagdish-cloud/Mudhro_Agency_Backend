import type { Pool, PoolClient } from "pg";

import type {
  AgencyClientRow,
  AgencyClientStatus,
} from "../types/agencyClient.js";

type Executor = Pool | PoolClient;

const CLIENT_COLUMNS = `
  id,
  organization_id,
  name,
  contact_name,
  email,
  phone,
  billing_address,
  gst_number,
  pan_number,
  state_code,
  status,
  notes,
  tags,
  created_by_org_user_id,
  created_at,
  updated_at,
  deleted_at
`;

export type InsertClientParams = {
  organizationId: string;
  createdByOrgUserId: string | null;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  billingAddress: string;
  gstNumber: string | null;
  panNumber: string | null;
  stateCode: string | null;
  status: AgencyClientStatus;
  notes: string | null;
  tags: string[];
};

export async function insertAgencyClient(
  exec: Executor,
  params: InsertClientParams,
): Promise<AgencyClientRow> {
  const result = await exec.query<AgencyClientRow>(
    `
      INSERT INTO agency_clients (
        organization_id, created_by_org_user_id, name, contact_name, email,
        phone, billing_address, gst_number, pan_number, state_code,
        status, notes, tags
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING ${CLIENT_COLUMNS};
    `,
    [
      params.organizationId,
      params.createdByOrgUserId,
      params.name,
      params.contactName,
      params.email,
      params.phone,
      params.billingAddress,
      params.gstNumber,
      params.panNumber,
      params.stateCode,
      params.status,
      params.notes,
      params.tags,
    ],
  );
  return result.rows[0];
}

export async function findAgencyClientById(
  exec: Executor,
  organizationId: string,
  id: string,
): Promise<AgencyClientRow | null> {
  const result = await exec.query<AgencyClientRow>(
    `
      SELECT ${CLIENT_COLUMNS}
      FROM agency_clients
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      LIMIT 1;
    `,
    [id, organizationId],
  );
  return result.rows[0] ?? null;
}

export type ListClientsFilters = {
  search?: string;
  status?: AgencyClientStatus;
  tag?: string;
  page: number;
  limit: number;
};

export type ListClientsResult = {
  items: AgencyClientRow[];
  total: number;
  page: number;
  limit: number;
};

export async function listAgencyClients(
  exec: Executor,
  organizationId: string,
  filters: ListClientsFilters,
): Promise<ListClientsResult> {
  const where: string[] = ["organization_id = $1", "deleted_at IS NULL"];
  const params: unknown[] = [organizationId];

  if (filters.status) {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  }
  if (filters.tag) {
    params.push(filters.tag);
    where.push(`$${params.length} = ANY(tags)`);
  }
  if (filters.search && filters.search.length > 0) {
    params.push(`%${filters.search.toLowerCase()}%`);
    const p = `$${params.length}`;
    where.push(
      `(lower(name) LIKE ${p} OR lower(email) LIKE ${p} OR lower(contact_name) LIKE ${p} OR phone LIKE ${p} OR coalesce(gst_number,'') LIKE upper(${p}))`,
    );
  }

  const whereClause = where.join(" AND ");

  const countResult = await exec.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM agency_clients WHERE ${whereClause};`,
    params,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const limit = filters.limit;
  const offset = (filters.page - 1) * limit;
  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  const rows = await exec.query<AgencyClientRow>(
    `
      SELECT ${CLIENT_COLUMNS}
      FROM agency_clients
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam};
    `,
    params,
  );

  return { items: rows.rows, total, page: filters.page, limit };
}

export type UpdateClientPatch = {
  name?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  billing_address?: string;
  gst_number?: string | null;
  pan_number?: string | null;
  state_code?: string | null;
  status?: AgencyClientStatus;
  notes?: string | null;
  tags?: string[];
};

export async function updateAgencyClient(
  exec: Executor,
  organizationId: string,
  id: string,
  patch: UpdateClientPatch,
): Promise<AgencyClientRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [];

  (Object.keys(patch) as Array<keyof UpdateClientPatch>).forEach((key) => {
    const value = patch[key];
    if (value === undefined) return;
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  });

  if (sets.length === 0) {
    return findAgencyClientById(exec, organizationId, id);
  }

  sets.push("updated_at = NOW()");

  params.push(id);
  const idParam = `$${params.length}`;
  params.push(organizationId);
  const orgParam = `$${params.length}`;

  const result = await exec.query<AgencyClientRow>(
    `
      UPDATE agency_clients
      SET ${sets.join(", ")}
      WHERE id = ${idParam}
        AND organization_id = ${orgParam}
        AND deleted_at IS NULL
      RETURNING ${CLIENT_COLUMNS};
    `,
    params,
  );
  return result.rows[0] ?? null;
}

export async function softDeleteAgencyClient(
  exec: Executor,
  organizationId: string,
  id: string,
): Promise<boolean> {
  const result = await exec.query(
    `
      UPDATE agency_clients
      SET deleted_at = NOW(), status = 'archived', updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL;
    `,
    [id, organizationId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function countClientActiveInvoices(
  exec: Executor,
  organizationId: string,
  clientId: string,
): Promise<number> {
  const result = await exec.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM agency_invoices
      WHERE organization_id = $1
        AND client_id = $2
        AND deleted_at IS NULL
        AND status NOT IN ('paid', 'cancelled');
    `,
    [organizationId, clientId],
  );
  return Number(result.rows[0]?.count ?? 0);
}
