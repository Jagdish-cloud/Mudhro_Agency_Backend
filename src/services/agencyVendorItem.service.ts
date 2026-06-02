import { pool } from "../db/pool.js";
import {
  findExpenseServiceByNormalizedName,
  insertExpenseService,
} from "../repositories/agencyExpense.repository.js";
import { findAgencyVendorById } from "../repositories/agencyVendor.repository.js";
import {
  findAgencyVendorItemById,
  findVendorItemByItemName,
  insertAgencyVendorItem,
  listAgencyVendorItemsByVendor,
  softDeleteAgencyVendorItem,
  updateAgencyVendorItem,
  type UpdateVendorItemPatch,
} from "../repositories/agencyVendorItem.repository.js";
import {
  toAgencyVendorItemDto,
  type AgencyVendorItemDto,
} from "../types/agencyVendorItem.js";
import { HttpError } from "../utils/httpError.js";
import type {
  CreateVendorItemInput,
  UpdateVendorItemInput,
} from "../validators/agencyVendorItem.schema.js";

async function assertVendorBelongsToOrg(
  organizationId: string,
  vendorId: string,
): Promise<void> {
  const v = await findAgencyVendorById(pool, organizationId, vendorId);
  if (!v) throw new HttpError(404, "Vendor not found.");
}

async function resolveExpenseServiceForCatalogItem(
  organizationId: string,
  itemName: string,
  defaultRate: number,
): Promise<string> {
  const trimmed = itemName.trim();
  const existing = await findExpenseServiceByNormalizedName(pool, organizationId, trimmed);
  if (existing) return existing.id;
  const row = await insertExpenseService(pool, {
    organizationId,
    name: trimmed,
    description: null,
    defaultRate,
  });
  return row.id;
}

export async function createAgencyVendorItemService(
  organizationId: string,
  actorId: string,
  vendorId: string,
  input: CreateVendorItemInput,
): Promise<AgencyVendorItemDto> {
  await assertVendorBelongsToOrg(organizationId, vendorId);

  const serviceId = await resolveExpenseServiceForCatalogItem(
    organizationId,
    input.itemName,
    input.defaultRate,
  );

  const duplicate = await findVendorItemByItemName(
    pool,
    organizationId,
    vendorId,
    input.itemName,
  );
  if (duplicate) {
    throw new HttpError(
      409,
      "A catalog item with this name already exists for this vendor.",
    );
  }

  const row = await insertAgencyVendorItem(pool, {
    organizationId,
    vendorId,
    createdByOrgUserId: actorId,
    serviceId,
    itemName: input.itemName,
    description: input.description ?? null,
    defaultQuantity: input.defaultQuantity,
    defaultRate: input.defaultRate,
  });
  const full = await findAgencyVendorItemById(pool, organizationId, vendorId, row.id);
  if (!full) throw new HttpError(500, "Failed to load catalog item.");
  return toAgencyVendorItemDto(full);
}

export async function listAgencyVendorItemsService(
  organizationId: string,
  vendorId: string,
  search?: string,
): Promise<AgencyVendorItemDto[]> {
  await assertVendorBelongsToOrg(organizationId, vendorId);
  const rows = await listAgencyVendorItemsByVendor(pool, organizationId, vendorId, search);
  return rows.map((r) => toAgencyVendorItemDto(r));
}

export async function getAgencyVendorItemService(
  organizationId: string,
  vendorId: string,
  id: string,
): Promise<AgencyVendorItemDto> {
  await assertVendorBelongsToOrg(organizationId, vendorId);
  const row = await findAgencyVendorItemById(pool, organizationId, vendorId, id);
  if (!row) throw new HttpError(404, "Catalog item not found.");
  return toAgencyVendorItemDto(row);
}

export async function updateAgencyVendorItemService(
  organizationId: string,
  vendorId: string,
  id: string,
  input: UpdateVendorItemInput,
): Promise<AgencyVendorItemDto> {
  await assertVendorBelongsToOrg(organizationId, vendorId);

  const existing = await findAgencyVendorItemById(pool, organizationId, vendorId, id);
  if (!existing) throw new HttpError(404, "Catalog item not found.");

  let resolvedServiceId: string | undefined;
  if (input.itemName !== undefined) {
    const rateForService =
      input.defaultRate !== undefined
        ? input.defaultRate
        : Number.parseFloat(String(existing.default_rate));
    resolvedServiceId = await resolveExpenseServiceForCatalogItem(
      organizationId,
      input.itemName,
      Number.isFinite(rateForService) ? rateForService : 0,
    );
    const collision = await findVendorItemByItemName(
      pool,
      organizationId,
      vendorId,
      input.itemName,
    );
    if (collision && collision.id !== id) {
      throw new HttpError(
        409,
        "Another catalog item with this name already exists for this vendor.",
      );
    }
  }

  const patch: UpdateVendorItemPatch = {};
  if (input.itemName !== undefined) {
    patch.item_name = input.itemName;
    patch.service_id = resolvedServiceId;
  }
  if (input.description !== undefined) patch.description = input.description ?? null;
  if (input.defaultQuantity !== undefined) patch.default_quantity = input.defaultQuantity;
  if (input.defaultRate !== undefined) patch.default_rate = input.defaultRate;

  const updated = await updateAgencyVendorItem(pool, organizationId, vendorId, id, patch);
  if (!updated) throw new HttpError(404, "Catalog item not found.");
  return toAgencyVendorItemDto(updated);
}

export async function softDeleteAgencyVendorItemService(
  organizationId: string,
  vendorId: string,
  id: string,
): Promise<void> {
  await assertVendorBelongsToOrg(organizationId, vendorId);
  const row = await findAgencyVendorItemById(pool, organizationId, vendorId, id);
  if (!row) throw new HttpError(404, "Catalog item not found.");
  const removed = await softDeleteAgencyVendorItem(pool, organizationId, vendorId, id);
  if (!removed) throw new HttpError(404, "Catalog item not found.");
}
