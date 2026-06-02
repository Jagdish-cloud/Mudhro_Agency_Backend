import type { Pool, PoolClient } from "pg";

import type {
  AgencyVendorItemRow,
  AgencyVendorItemWithServiceRow,
} from "../types/agencyVendorItem.js";

type Executor = Pool | PoolClient;

const ITEM_BASE = `
  id, organization_id, vendor_id, service_id, item_name, description,
  default_quantity, default_rate, created_by_org_user_id, created_at,
  updated_at, deleted_at
`;

const ITEM_COLUMNS = `
  vi.id,
  vi.organization_id,
  vi.vendor_id,
  vi.service_id,
  vi.item_name,
  vi.description,
  vi.default_quantity,
  vi.default_rate,
  vi.created_by_org_user_id,
  vi.created_at,
  vi.updated_at,
  vi.deleted_at
`;

export type InsertVendorItemParams = {
  organizationId: string;
  vendorId: string;
  createdByOrgUserId: string | null;
  serviceId: string;
  itemName: string;
  description: string | null;
  defaultQuantity: number;
  defaultRate: number;
};

export async function insertAgencyVendorItem(
  exec: Executor,
  params: InsertVendorItemParams,
): Promise<AgencyVendorItemRow> {
  const result = await exec.query<AgencyVendorItemRow>(
    `
      INSERT INTO agency_vendor_items (
        organization_id, vendor_id, created_by_org_user_id, service_id,
        item_name, description, default_quantity, default_rate
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING ${ITEM_BASE};
    `,
    [
      params.organizationId,
      params.vendorId,
      params.createdByOrgUserId,
      params.serviceId,
      params.itemName,
      params.description,
      params.defaultQuantity,
      params.defaultRate,
    ],
  );
  return result.rows[0];
}

export async function findAgencyVendorItemById(
  exec: Executor,
  organizationId: string,
  vendorId: string,
  id: string,
): Promise<AgencyVendorItemWithServiceRow | null> {
  const result = await exec.query<AgencyVendorItemWithServiceRow>(
    `
      SELECT ${ITEM_COLUMNS}, s.name AS service_name
      FROM agency_vendor_items vi
      INNER JOIN agency_expense_services s ON s.id = vi.service_id
      WHERE vi.id = $1
        AND vi.organization_id = $2
        AND vi.vendor_id = $3
        AND vi.deleted_at IS NULL
      LIMIT 1;
    `,
    [id, organizationId, vendorId],
  );
  return result.rows[0] ?? null;
}

export async function findVendorItemByItemName(
  exec: Executor,
  organizationId: string,
  vendorId: string,
  itemName: string,
): Promise<AgencyVendorItemRow | null> {
  const result = await exec.query<AgencyVendorItemRow>(
    `
      SELECT ${ITEM_BASE}
      FROM agency_vendor_items
      WHERE organization_id = $1
        AND vendor_id = $2
        AND lower(trim(item_name)) = lower(trim($3))
        AND deleted_at IS NULL
      LIMIT 1;
    `,
    [organizationId, vendorId, itemName],
  );
  return result.rows[0] ?? null;
}

export async function listAgencyVendorItemsByVendor(
  exec: Executor,
  organizationId: string,
  vendorId: string,
  search?: string,
): Promise<AgencyVendorItemWithServiceRow[]> {
  const params: unknown[] = [organizationId, vendorId];
  let where =
    "vi.organization_id = $1 AND vi.vendor_id = $2 AND vi.deleted_at IS NULL";
  if (search && search.trim().length > 0) {
    params.push(`%${search.trim().toLowerCase()}%`);
    where += ` AND (lower(vi.item_name) LIKE $${params.length} OR lower(s.name) LIKE $${params.length})`;
  }
  const result = await exec.query<AgencyVendorItemWithServiceRow>(
    `
      SELECT ${ITEM_COLUMNS}, s.name AS service_name
      FROM agency_vendor_items vi
      INNER JOIN agency_expense_services s ON s.id = vi.service_id
      WHERE ${where}
      ORDER BY vi.updated_at DESC, vi.item_name ASC;
    `,
    params,
  );
  return result.rows;
}

export type UpdateVendorItemPatch = {
  service_id?: string;
  item_name?: string;
  description?: string | null;
  default_quantity?: number;
  default_rate?: number;
};

export async function updateAgencyVendorItem(
  exec: Executor,
  organizationId: string,
  vendorId: string,
  id: string,
  patch: UpdateVendorItemPatch,
): Promise<AgencyVendorItemWithServiceRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [];

  (Object.keys(patch) as Array<keyof UpdateVendorItemPatch>).forEach((key) => {
    const value = patch[key];
    if (value === undefined) return;
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  });

  if (sets.length === 0) {
    return findAgencyVendorItemById(exec, organizationId, vendorId, id);
  }

  sets.push("updated_at = NOW()");

  params.push(id);
  const idParam = `$${params.length}`;
  params.push(organizationId);
  const orgParam = `$${params.length}`;
  params.push(vendorId);
  const vendorParam = `$${params.length}`;

  await exec.query(
    `
      UPDATE agency_vendor_items
      SET ${sets.join(", ")}
      WHERE id = ${idParam}
        AND organization_id = ${orgParam}
        AND vendor_id = ${vendorParam}
        AND deleted_at IS NULL;
    `,
    params,
  );
  return findAgencyVendorItemById(exec, organizationId, vendorId, id);
}

export async function softDeleteAgencyVendorItem(
  exec: Executor,
  organizationId: string,
  vendorId: string,
  id: string,
): Promise<boolean> {
  const result = await exec.query(
    `
      UPDATE agency_vendor_items
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1
        AND organization_id = $2
        AND vendor_id = $3
        AND deleted_at IS NULL;
    `,
    [id, organizationId, vendorId],
  );
  return (result.rowCount ?? 0) > 0;
}
