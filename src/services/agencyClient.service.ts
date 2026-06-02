import { pool } from "../db/pool.js";
import {
  countClientActiveInvoices,
  findAgencyClientById,
  insertAgencyClient,
  listAgencyClients as listAgencyClientsRepo,
  softDeleteAgencyClient,
  updateAgencyClient,
  type ListClientsFilters,
  type UpdateClientPatch,
} from "../repositories/agencyClient.repository.js";
import {
  toAgencyClientDto,
  type AgencyClientDto,
} from "../types/agencyClient.js";
import { HttpError } from "../utils/httpError.js";
import type {
  CreateClientInput,
  ListClientsQuery,
  UpdateClientInput,
} from "../validators/agencyClient.schema.js";

function deriveStateCode(gstNumber: string | undefined): string | null {
  if (!gstNumber || gstNumber.length < 2) return null;
  return gstNumber.slice(0, 2);
}

export async function createAgencyClientService(
  organizationId: string,
  createdByOrgUserId: string,
  input: CreateClientInput,
): Promise<AgencyClientDto> {
  const row = await insertAgencyClient(pool, {
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
  return toAgencyClientDto(row);
}

export type ListAgencyClientsResult = {
  items: AgencyClientDto[];
  total: number;
  page: number;
  limit: number;
};

export async function listAgencyClientsService(
  organizationId: string,
  query: ListClientsQuery,
): Promise<ListAgencyClientsResult> {
  const filters: ListClientsFilters = {
    search: query.search,
    status: query.status,
    tag: query.tag,
    page: query.page,
    limit: query.limit,
  };
  const result = await listAgencyClientsRepo(pool, organizationId, filters);
  return {
    items: result.items.map(toAgencyClientDto),
    total: result.total,
    page: result.page,
    limit: result.limit,
  };
}

export async function getAgencyClientService(
  organizationId: string,
  id: string,
): Promise<AgencyClientDto> {
  const row = await findAgencyClientById(pool, organizationId, id);
  if (!row) throw new HttpError(404, "Client not found.");
  return toAgencyClientDto(row);
}

export async function updateAgencyClientService(
  organizationId: string,
  id: string,
  input: UpdateClientInput,
): Promise<AgencyClientDto> {
  const existing = await findAgencyClientById(pool, organizationId, id);
  if (!existing) throw new HttpError(404, "Client not found.");

  const patch: UpdateClientPatch = {};
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

  const updated = await updateAgencyClient(pool, organizationId, id, patch);
  if (!updated) throw new HttpError(404, "Client not found.");
  return toAgencyClientDto(updated);
}

export async function deleteAgencyClientService(
  organizationId: string,
  id: string,
): Promise<void> {
  const existing = await findAgencyClientById(pool, organizationId, id);
  if (!existing) throw new HttpError(404, "Client not found.");

  const activeInvoices = await countClientActiveInvoices(pool, organizationId, id);
  if (activeInvoices > 0) {
    throw new HttpError(
      409,
      "Cannot delete a client with active (unpaid / non-cancelled) invoices.",
    );
  }

  const removed = await softDeleteAgencyClient(pool, organizationId, id);
  if (!removed) throw new HttpError(404, "Client not found.");
}
