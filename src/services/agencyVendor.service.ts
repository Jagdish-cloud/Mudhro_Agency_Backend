import { pool } from "../db/pool.js";
import {
  findAgencyVendorById,
  insertAgencyVendor,
  listAgencyVendors as listAgencyVendorsRepo,
  softDeleteAgencyVendor,
  updateAgencyVendor,
  type ListVendorsFilters,
  type UpdateVendorPatch,
} from "../repositories/agencyVendor.repository.js";
import { toAgencyVendorDto, type AgencyVendorDto } from "../types/agencyVendor.js";
import { HttpError } from "../utils/httpError.js";
import type {
  CreateVendorInput,
  ListVendorsQuery,
  UpdateVendorInput,
} from "../validators/agencyVendor.schema.js";

function deriveStateCode(gstNumber: string | undefined): string | null {
  if (!gstNumber || gstNumber.length < 2) return null;
  return gstNumber.slice(0, 2);
}

export async function createAgencyVendorService(
  organizationId: string,
  createdByOrgUserId: string,
  input: CreateVendorInput,
): Promise<AgencyVendorDto> {
  const row = await insertAgencyVendor(pool, {
    organizationId,
    createdByOrgUserId,
    name: input.name,
    contactName: input.contactName,
    email: input.email,
    phone: input.phone,
    billingAddress: input.billingAddress,
    gstNumber: input.gstNumber ?? null,
    panNumber: input.panNumber ?? null,
    stateCode: input.stateCode ?? deriveStateCode(input.gstNumber) ?? null,
    status: input.status,
    notes: input.notes ?? null,
    tags: input.tags,
  });
  return toAgencyVendorDto(row);
}

export type ListAgencyVendorsResult = {
  items: AgencyVendorDto[];
  total: number;
  page: number;
  limit: number;
};

export async function listAgencyVendorsService(
  organizationId: string,
  query: ListVendorsQuery,
): Promise<ListAgencyVendorsResult> {
  const filters: ListVendorsFilters = {
    search: query.search,
    status: query.status,
    tag: query.tag,
    page: query.page,
    limit: query.limit,
  };
  const result = await listAgencyVendorsRepo(pool, organizationId, filters);
  return {
    items: result.items.map(toAgencyVendorDto),
    total: result.total,
    page: result.page,
    limit: result.limit,
  };
}

export async function getAgencyVendorService(
  organizationId: string,
  id: string,
): Promise<AgencyVendorDto> {
  const row = await findAgencyVendorById(pool, organizationId, id);
  if (!row) throw new HttpError(404, "Vendor not found.");
  return toAgencyVendorDto(row);
}

export async function updateAgencyVendorService(
  organizationId: string,
  id: string,
  input: UpdateVendorInput,
): Promise<AgencyVendorDto> {
  const existing = await findAgencyVendorById(pool, organizationId, id);
  if (!existing) throw new HttpError(404, "Vendor not found.");

  const patch: UpdateVendorPatch = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.contactName !== undefined) patch.contact_name = input.contactName;
  if (input.email !== undefined) patch.email = input.email;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.billingAddress !== undefined) patch.billing_address = input.billingAddress;
  if (input.gstNumber !== undefined) {
    patch.gst_number = input.gstNumber ?? null;
    if (input.stateCode === undefined) {
      patch.state_code = deriveStateCode(input.gstNumber) ?? null;
    }
  }
  if (input.panNumber !== undefined) patch.pan_number = input.panNumber ?? null;
  if (input.stateCode !== undefined) patch.state_code = input.stateCode ?? null;
  if (input.status !== undefined) patch.status = input.status;
  if (input.notes !== undefined) patch.notes = input.notes ?? null;
  if (input.tags !== undefined) patch.tags = input.tags;

  const updated = await updateAgencyVendor(pool, organizationId, id, patch);
  if (!updated) throw new HttpError(404, "Vendor not found.");
  return toAgencyVendorDto(updated);
}

export async function deleteAgencyVendorService(
  organizationId: string,
  id: string,
): Promise<void> {
  const existing = await findAgencyVendorById(pool, organizationId, id);
  if (!existing) throw new HttpError(404, "Vendor not found.");

  const removed = await softDeleteAgencyVendor(pool, organizationId, id);
  if (!removed) throw new HttpError(404, "Vendor not found.");
}
