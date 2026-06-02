import type { Pool, PoolClient } from "pg";

import type { AgencyClientItemRow } from "../types/agencyClientItem.js";

type Executor = Pool | PoolClient;

const ITEM_COLUMNS = `
  id,
  organization_id,
  client_id,
  item_name,
  description,
  hsn_code,
  default_rate,
  default_tax_percent,
  default_discount_percent,
  unit,
  created_by_org_user_id,
  created_at,
  updated_at,
  deleted_at
`;

export type InsertClientItemParams = {
  organizationId: string;
  clientId: string;
  createdByOrgUserId: string | null;
  itemName: string;
  description: string | null;
  hsnCode: string;
  defaultRate: number;
  defaultTaxPercent: number;
  defaultDiscountPercent: number;
  unit: string | null;
};

export async function insertAgencyClientItem(
  exec: Executor,
  params: InsertClientItemParams,
): Promise<AgencyClientItemRow> {
  const result = await exec.query<AgencyClientItemRow>(
    `
      INSERT INTO agency_client_items (
        organization_id, client_id, created_by_org_user_id, item_name,
        description, hsn_code, default_rate, default_tax_percent,
        default_discount_percent, unit
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING ${ITEM_COLUMNS};
    `,
    [
      params.organizationId,
      params.clientId,
      params.createdByOrgUserId,
      params.itemName,
      params.description,
      params.hsnCode,
      params.defaultRate,
      params.defaultTaxPercent,
      params.defaultDiscountPercent,
      params.unit,
    ],
  );
  return result.rows[0];
}

export async function findAgencyClientItemById(
  exec: Executor,
  organizationId: string,
  clientId: string,
  id: string,
): Promise<AgencyClientItemRow | null> {
  const result = await exec.query<AgencyClientItemRow>(
    `
      SELECT ${ITEM_COLUMNS}
      FROM agency_client_items
      WHERE id = $1
        AND organization_id = $2
        AND client_id = $3
        AND deleted_at IS NULL
      LIMIT 1;
    `,
    [id, organizationId, clientId],
  );
  return result.rows[0] ?? null;
}

export async function listAgencyClientItemsByClient(
  exec: Executor,
  organizationId: string,
  clientId: string,
  search?: string,
): Promise<AgencyClientItemRow[]> {
  const params: unknown[] = [organizationId, clientId];
  let where = "organization_id = $1 AND client_id = $2 AND deleted_at IS NULL";
  if (search && search.trim().length > 0) {
    params.push(`%${search.trim().toLowerCase()}%`);
    where += ` AND (lower(item_name) LIKE $${params.length} OR lower(hsn_code) LIKE $${params.length})`;
  }
  const result = await exec.query<AgencyClientItemRow>(
    `
      SELECT ${ITEM_COLUMNS}
      FROM agency_client_items
      WHERE ${where}
      ORDER BY updated_at DESC, item_name ASC;
    `,
    params,
  );
  return result.rows;
}

export async function findByClientNameHsn(
  exec: Executor,
  organizationId: string,
  clientId: string,
  itemName: string,
  hsnCode: string,
): Promise<AgencyClientItemRow | null> {
  const result = await exec.query<AgencyClientItemRow>(
    `
      SELECT ${ITEM_COLUMNS}
      FROM agency_client_items
      WHERE organization_id = $1
        AND client_id = $2
        AND lower(item_name) = lower($3)
        AND hsn_code = $4
        AND deleted_at IS NULL
      LIMIT 1;
    `,
    [organizationId, clientId, itemName, hsnCode],
  );
  return result.rows[0] ?? null;
}

export type UpdateClientItemPatch = {
  item_name?: string;
  description?: string | null;
  hsn_code?: string;
  default_rate?: number;
  default_tax_percent?: number;
  default_discount_percent?: number;
  unit?: string | null;
};

export async function updateAgencyClientItem(
  exec: Executor,
  organizationId: string,
  clientId: string,
  id: string,
  patch: UpdateClientItemPatch,
): Promise<AgencyClientItemRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [];

  (Object.keys(patch) as Array<keyof UpdateClientItemPatch>).forEach((key) => {
    const value = patch[key];
    if (value === undefined) return;
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  });

  if (sets.length === 0) {
    return findAgencyClientItemById(exec, organizationId, clientId, id);
  }

  sets.push("updated_at = NOW()");

  params.push(id);
  const idParam = `$${params.length}`;
  params.push(organizationId);
  const orgParam = `$${params.length}`;
  params.push(clientId);
  const clientParam = `$${params.length}`;

  const result = await exec.query<AgencyClientItemRow>(
    `
      UPDATE agency_client_items
      SET ${sets.join(", ")}
      WHERE id = ${idParam}
        AND organization_id = ${orgParam}
        AND client_id = ${clientParam}
        AND deleted_at IS NULL
      RETURNING ${ITEM_COLUMNS};
    `,
    params,
  );
  return result.rows[0] ?? null;
}

export async function softDeleteAgencyClientItem(
  exec: Executor,
  organizationId: string,
  clientId: string,
  id: string,
): Promise<boolean> {
  const result = await exec.query(
    `
      UPDATE agency_client_items
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1
        AND organization_id = $2
        AND client_id = $3
        AND deleted_at IS NULL;
    `,
    [id, organizationId, clientId],
  );
  return (result.rowCount ?? 0) > 0;
}
