import { pool } from "../db/pool.js";
import { findAgencyClientById } from "../repositories/agencyClient.repository.js";
import {
  findAgencyClientItemById,
  findByClientNameHsn,
  insertAgencyClientItem,
  listAgencyClientItemsByClient,
  softDeleteAgencyClientItem,
  updateAgencyClientItem,
  type UpdateClientItemPatch,
} from "../repositories/agencyClientItem.repository.js";
import {
  toAgencyClientItemDto,
  type AgencyClientItemDto,
} from "../types/agencyClientItem.js";
import { HttpError } from "../utils/httpError.js";
import type {
  CreateClientItemInput,
  SaveInvoiceRowToCatalogInput,
  UpdateClientItemInput,
} from "../validators/agencyClientItem.schema.js";

async function assertClientBelongsToOrg(
  organizationId: string,
  clientId: string,
): Promise<void> {
  const client = await findAgencyClientById(pool, organizationId, clientId);
  if (!client) throw new HttpError(404, "Client not found.");
}

export async function createAgencyClientItemService(
  organizationId: string,
  actorId: string,
  clientId: string,
  input: CreateClientItemInput,
): Promise<AgencyClientItemDto> {
  await assertClientBelongsToOrg(organizationId, clientId);

  const existing = await findByClientNameHsn(
    pool,
    organizationId,
    clientId,
    input.itemName,
    input.hsnCode,
  );
  if (existing) {
    throw new HttpError(
      409,
      "A catalog item with this name and HSN already exists for this client.",
    );
  }

  const row = await insertAgencyClientItem(pool, {
    organizationId,
    clientId,
    createdByOrgUserId: actorId,
    itemName: input.itemName,
    description: input.description ?? null,
    hsnCode: input.hsnCode,
    defaultRate: input.defaultRate,
    defaultTaxPercent: input.defaultTaxPercent,
    defaultDiscountPercent: input.defaultDiscountPercent,
    unit: input.unit ?? null,
  });
  return toAgencyClientItemDto(row);
}

export async function listAgencyClientItemsService(
  organizationId: string,
  clientId: string,
  search?: string,
): Promise<AgencyClientItemDto[]> {
  await assertClientBelongsToOrg(organizationId, clientId);
  const rows = await listAgencyClientItemsByClient(
    pool,
    organizationId,
    clientId,
    search,
  );
  return rows.map(toAgencyClientItemDto);
}

export async function getAgencyClientItemService(
  organizationId: string,
  clientId: string,
  id: string,
): Promise<AgencyClientItemDto> {
  await assertClientBelongsToOrg(organizationId, clientId);
  const row = await findAgencyClientItemById(
    pool,
    organizationId,
    clientId,
    id,
  );
  if (!row) throw new HttpError(404, "Catalog item not found.");
  return toAgencyClientItemDto(row);
}

export async function updateAgencyClientItemService(
  organizationId: string,
  clientId: string,
  id: string,
  input: UpdateClientItemInput,
): Promise<AgencyClientItemDto> {
  await assertClientBelongsToOrg(organizationId, clientId);

  const existing = await findAgencyClientItemById(
    pool,
    organizationId,
    clientId,
    id,
  );
  if (!existing) throw new HttpError(404, "Catalog item not found.");

  // If the identifying fields are changing, make sure the new (name, hsn)
  // does not collide with another live row.
  const nextName = input.itemName ?? existing.item_name;
  const nextHsn = input.hsnCode ?? existing.hsn_code;
  if (
    nextName.toLowerCase() !== existing.item_name.toLowerCase() ||
    nextHsn !== existing.hsn_code
  ) {
    const collision = await findByClientNameHsn(
      pool,
      organizationId,
      clientId,
      nextName,
      nextHsn,
    );
    if (collision && collision.id !== id) {
      throw new HttpError(
        409,
        "Another catalog item with this name and HSN already exists for this client.",
      );
    }
  }

  const patch: UpdateClientItemPatch = {};
  if (input.itemName !== undefined) patch.item_name = input.itemName;
  if (input.description !== undefined) {
    patch.description = input.description ?? null;
  }
  if (input.hsnCode !== undefined) patch.hsn_code = input.hsnCode;
  if (input.defaultRate !== undefined) patch.default_rate = input.defaultRate;
  if (input.defaultTaxPercent !== undefined) {
    patch.default_tax_percent = input.defaultTaxPercent;
  }
  if (input.defaultDiscountPercent !== undefined) {
    patch.default_discount_percent = input.defaultDiscountPercent;
  }
  if (input.unit !== undefined) patch.unit = input.unit ?? null;

  const updated = await updateAgencyClientItem(
    pool,
    organizationId,
    clientId,
    id,
    patch,
  );
  if (!updated) throw new HttpError(404, "Catalog item not found.");
  return toAgencyClientItemDto(updated);
}

export async function softDeleteAgencyClientItemService(
  organizationId: string,
  clientId: string,
  id: string,
): Promise<void> {
  await assertClientBelongsToOrg(organizationId, clientId);
  const existing = await findAgencyClientItemById(
    pool,
    organizationId,
    clientId,
    id,
  );
  if (!existing) throw new HttpError(404, "Catalog item not found.");
  const removed = await softDeleteAgencyClientItem(
    pool,
    organizationId,
    clientId,
    id,
  );
  if (!removed) throw new HttpError(404, "Catalog item not found.");
}

// Upsert by (clientId, lower(itemName), hsnCode). Updates defaults if a live
// row is found, otherwise inserts a new catalog item. Used by the Invoice
// Builder "Save to catalog" per-row button.
export async function upsertClientItemFromRowService(
  organizationId: string,
  actorId: string,
  clientId: string,
  input: SaveInvoiceRowToCatalogInput,
): Promise<AgencyClientItemDto> {
  await assertClientBelongsToOrg(organizationId, clientId);

  const existing = await findByClientNameHsn(
    pool,
    organizationId,
    clientId,
    input.itemName,
    input.hsnCode,
  );

  if (existing) {
    const patch: UpdateClientItemPatch = {
      default_rate: input.rate,
      default_tax_percent: input.taxPercent,
      default_discount_percent: input.discountPercent,
    };
    if (input.description !== undefined) {
      patch.description = input.description ?? null;
    }
    if (input.unit !== undefined) patch.unit = input.unit ?? null;
    const updated = await updateAgencyClientItem(
      pool,
      organizationId,
      clientId,
      existing.id,
      patch,
    );
    if (!updated) {
      throw new HttpError(500, "Failed to update catalog item.");
    }
    return toAgencyClientItemDto(updated);
  }

  const row = await insertAgencyClientItem(pool, {
    organizationId,
    clientId,
    createdByOrgUserId: actorId,
    itemName: input.itemName,
    description: input.description ?? null,
    hsnCode: input.hsnCode,
    defaultRate: input.rate,
    defaultTaxPercent: input.taxPercent,
    defaultDiscountPercent: input.discountPercent,
    unit: input.unit ?? null,
  });
  return toAgencyClientItemDto(row);
}
