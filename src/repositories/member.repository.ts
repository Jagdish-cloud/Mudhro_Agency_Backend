import type { Pool } from "pg";

import type { UserRole } from "../types/auth.js";
import type { MemberRow, MemberStatus } from "../types/member.js";

const MEMBER_COLUMNS = `
  id,
  organization_id,
  name,
  email,
  number,
  designation,
  role,
  status,
  created_at,
  updated_at
`;

export type InsertMemberParams = {
  organizationId: string;
  name: string;
  email: string;
  number: string;
  designation: string;
  passwordHash: string;
  role: UserRole;
};

export async function insertMember(pool: Pool, params: InsertMemberParams): Promise<MemberRow> {
  const query = `
    INSERT INTO organization_admins (
      organization_id,
      name,
      email,
      number,
      designation,
      password_hash,
      role
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING ${MEMBER_COLUMNS};
  `;
  const values = [
    params.organizationId,
    params.name,
    params.email,
    params.number,
    params.designation,
    params.passwordHash,
    params.role,
  ];
  const result = await pool.query<MemberRow>(query, values);
  return result.rows[0];
}

export async function findMemberById(
  pool: Pool,
  organizationId: string,
  id: string,
): Promise<MemberRow | null> {
  const query = `
    SELECT ${MEMBER_COLUMNS}
    FROM organization_admins
    WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
    LIMIT 1;
  `;
  const result = await pool.query<MemberRow>(query, [id, organizationId]);
  return result.rows[0] ?? null;
}

export type ListMembersFilters = {
  role?: UserRole;
  status?: MemberStatus;
  search?: string;
  page: number;
  limit: number;
};

export type ListMembersResult = {
  items: MemberRow[];
  total: number;
  page: number;
  limit: number;
};

export async function listMembers(
  pool: Pool,
  organizationId: string,
  filters: ListMembersFilters,
): Promise<ListMembersResult> {
  const where: string[] = ["organization_id = $1", "deleted_at IS NULL"];
  const params: unknown[] = [organizationId];

  if (filters.role !== undefined) {
    params.push(filters.role);
    where.push(`role = $${params.length}`);
  }
  if (filters.status !== undefined) {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  }
  if (filters.search && filters.search.length > 0) {
    params.push(`%${filters.search.toLowerCase()}%`);
    const p = `$${params.length}`;
    where.push(
      `(lower(name) LIKE ${p} OR lower(email) LIKE ${p} OR lower(designation) LIKE ${p} OR number LIKE ${p})`,
    );
  }

  const whereClause = where.join(" AND ");

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM organization_admins WHERE ${whereClause};`,
    params,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const limit = filters.limit;
  const offset = (filters.page - 1) * limit;
  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  const rowsResult = await pool.query<MemberRow>(
    `
      SELECT ${MEMBER_COLUMNS}
      FROM organization_admins
      WHERE ${whereClause}
      ORDER BY role ASC, created_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam};
    `,
    params,
  );

  return { items: rowsResult.rows, total, page: filters.page, limit };
}

export type UpdateMemberPatch = {
  name?: string;
  number?: string;
  designation?: string;
  status?: MemberStatus;
  role?: UserRole;
};

export async function updateMember(
  pool: Pool,
  organizationId: string,
  id: string,
  patch: UpdateMemberPatch,
): Promise<MemberRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [];

  (Object.keys(patch) as Array<keyof UpdateMemberPatch>).forEach((key) => {
    const value = patch[key];
    if (value === undefined) return;
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  });

  if (sets.length === 0) {
    return findMemberById(pool, organizationId, id);
  }

  sets.push("updated_at = NOW()");

  params.push(id);
  const idParam = `$${params.length}`;
  params.push(organizationId);
  const orgParam = `$${params.length}`;

  const query = `
    UPDATE organization_admins
    SET ${sets.join(", ")}
    WHERE id = ${idParam}
      AND organization_id = ${orgParam}
      AND deleted_at IS NULL
    RETURNING ${MEMBER_COLUMNS};
  `;
  const result = await pool.query<MemberRow>(query, params);
  return result.rows[0] ?? null;
}

export async function softDeleteMember(
  pool: Pool,
  organizationId: string,
  id: string,
): Promise<boolean> {
  const result = await pool.query(
    `
      UPDATE organization_admins
      SET deleted_at = NOW(), status = 'inactive', updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL;
    `,
    [id, organizationId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getAdminPasswordHashById(
  pool: Pool,
  organizationId: string,
  id: string,
): Promise<string | null> {
  const result = await pool.query<{ password_hash: string }>(
    `
      SELECT password_hash
      FROM organization_admins
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      LIMIT 1;
    `,
    [id, organizationId],
  );
  return result.rows[0]?.password_hash ?? null;
}

export async function updateAdminPasswordHashById(
  pool: Pool,
  organizationId: string,
  id: string,
  passwordHash: string,
): Promise<boolean> {
  const result = await pool.query(
    `
      UPDATE organization_admins
      SET password_hash = $1, updated_at = NOW()
      WHERE id = $2 AND organization_id = $3 AND deleted_at IS NULL;
    `,
    [passwordHash, id, organizationId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function countActiveAdmins(pool: Pool, organizationId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM organization_admins
      WHERE organization_id = $1
        AND role = 1
        AND status = 'active'
        AND deleted_at IS NULL;
    `,
    [organizationId],
  );
  return Number(result.rows[0]?.count ?? 0);
}
