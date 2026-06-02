import type { Pool, PoolClient } from "pg";

import type {
  AgencyProjectListRow,
  AgencyProjectRow,
  AgencyProjectStatus,
} from "../types/agencyProject.js";

type Executor = Pool | PoolClient;

const PROJECT_COLUMNS = `
  id,
  organization_id,
  name,
  description,
  start_date,
  end_date,
  status,
  budget,
  currency,
  created_by_org_user_id,
  created_at,
  updated_at,
  deleted_at
`;

export type InsertProjectParams = {
  organizationId: string;
  createdByOrgUserId: string | null;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  status: AgencyProjectStatus;
  budget: number | null;
  currency: string;
};

export async function insertAgencyProject(
  exec: Executor,
  params: InsertProjectParams,
): Promise<AgencyProjectRow> {
  const result = await exec.query<AgencyProjectRow>(
    `
      INSERT INTO agency_projects (
        organization_id, created_by_org_user_id, name, description,
        start_date, end_date, status, budget, currency
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING ${PROJECT_COLUMNS};
    `,
    [
      params.organizationId,
      params.createdByOrgUserId,
      params.name,
      params.description,
      params.startDate,
      params.endDate,
      params.status,
      params.budget,
      params.currency,
    ],
  );
  return result.rows[0];
}

export async function findAgencyProjectById(
  exec: Executor,
  organizationId: string,
  id: string,
): Promise<AgencyProjectRow | null> {
  const result = await exec.query<AgencyProjectRow>(
    `
      SELECT ${PROJECT_COLUMNS}
      FROM agency_projects
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      LIMIT 1;
    `,
    [id, organizationId],
  );
  return result.rows[0] ?? null;
}

export type UpdateProjectPatch = {
  name?: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: AgencyProjectStatus;
  budget?: number | null;
  currency?: string;
};

export async function updateAgencyProject(
  exec: Executor,
  organizationId: string,
  id: string,
  patch: UpdateProjectPatch,
): Promise<AgencyProjectRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [];

  (Object.keys(patch) as Array<keyof UpdateProjectPatch>).forEach((key) => {
    const value = patch[key];
    if (value === undefined) return;
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  });

  if (sets.length === 0) {
    return findAgencyProjectById(exec, organizationId, id);
  }

  sets.push("updated_at = NOW()");

  params.push(id);
  const idParam = `$${params.length}`;
  params.push(organizationId);
  const orgParam = `$${params.length}`;

  const result = await exec.query<AgencyProjectRow>(
    `
      UPDATE agency_projects
      SET ${sets.join(", ")}
      WHERE id = ${idParam}
        AND organization_id = ${orgParam}
        AND deleted_at IS NULL
      RETURNING ${PROJECT_COLUMNS};
    `,
    params,
  );
  return result.rows[0] ?? null;
}

export async function softDeleteAgencyProject(
  exec: Executor,
  organizationId: string,
  id: string,
): Promise<boolean> {
  const result = await exec.query(
    `
      UPDATE agency_projects
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL;
    `,
    [id, organizationId],
  );
  return (result.rowCount ?? 0) > 0;
}

export type ListProjectsFilters = {
  status?: AgencyProjectStatus;
  search?: string;
};

/**
 * List projects for an organization, joined with junction-derived counts and
 * the agreement signing rollup. Returns one row per project.
 */
export async function listAgencyProjectsWithCounts(
  exec: Executor,
  organizationId: string,
  filters: ListProjectsFilters,
): Promise<AgencyProjectListRow[]> {
  const where: string[] = ["p.organization_id = $1", "p.deleted_at IS NULL"];
  const params: unknown[] = [organizationId];

  if (filters.status) {
    params.push(filters.status);
    where.push(`p.status = $${params.length}`);
  }
  if (filters.search && filters.search.length > 0) {
    params.push(`%${filters.search.toLowerCase()}%`);
    where.push(`lower(p.name) LIKE $${params.length}`);
  }

  const whereClause = where.join(" AND ");

  const result = await exec.query<AgencyProjectListRow>(
    `
      SELECT
        p.id,
        p.organization_id,
        p.name,
        p.description,
        p.start_date,
        p.end_date,
        p.status,
        p.budget,
        p.currency,
        p.created_by_org_user_id,
        p.created_at,
        p.updated_at,
        p.deleted_at,
        COALESCE(pc.client_count, 0)::text AS client_count,
        a.id AS agreement_id,
        a.status AS agreement_status,
        COALESCE(sig.signed_count, 0)::text AS signed_client_count,
        COALESCE(lk.total_links, 0)::text AS total_links
      FROM agency_projects p
      LEFT JOIN (
        SELECT project_id, COUNT(*) AS client_count
        FROM agency_project_clients
        GROUP BY project_id
      ) pc ON pc.project_id = p.id
      LEFT JOIN agency_agreements a
        ON a.project_id = p.id AND a.deleted_at IS NULL
      LEFT JOIN (
        SELECT agreement_id, COUNT(DISTINCT client_id) AS signed_count
        FROM agency_agreement_signatures
        WHERE signer_type = 'client'
        GROUP BY agreement_id
      ) sig ON sig.agreement_id = a.id
      LEFT JOIN (
        SELECT agreement_id, COUNT(*) AS total_links
        FROM agency_agreement_client_links
        GROUP BY agreement_id
      ) lk ON lk.agreement_id = a.id
      WHERE ${whereClause}
      ORDER BY p.created_at DESC;
    `,
    params,
  );
  return result.rows;
}
