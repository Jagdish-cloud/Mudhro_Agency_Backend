import type { Pool } from "pg";

import type { UserRole } from "../types/auth.js";

export type AdminAuthRow = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  organization_id: string;
  organization_name: string;
  role: UserRole;
  status: "active" | "inactive";
};

export async function findAdminByEmail(pool: Pool, email: string): Promise<AdminAuthRow | null> {
  const query = `
    SELECT
      a.id,
      a.email,
      a.name,
      a.password_hash,
      a.organization_id,
      a.role,
      a.status,
      o.name AS organization_name
    FROM organization_admins a
    INNER JOIN organizations o ON o.id = a.organization_id
    WHERE lower(a.email) = lower($1)
      AND a.deleted_at IS NULL
    LIMIT 1;
  `;

  const result = await pool.query<AdminAuthRow>(query, [email]);
  return result.rows[0] ?? null;
}
