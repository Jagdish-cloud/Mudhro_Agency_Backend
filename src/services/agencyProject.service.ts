import { pool } from "../db/pool.js";
import {
  findAgencyProjectById,
  insertAgencyProject,
  listAgencyProjectsWithCounts,
  softDeleteAgencyProject,
  updateAgencyProject,
  type ListProjectsFilters,
  type UpdateProjectPatch,
} from "../repositories/agencyProject.repository.js";
import {
  assertClientsBelongToOrg,
  listClientsForProject,
  removeClientFromProject,
  replaceClientsForProject,
} from "../repositories/agencyProjectClient.repository.js";
import {
  toAgencyClientDto,
  type AgencyClientDto,
} from "../types/agencyClient.js";
import {
  toAgencyProjectDto,
  toAgencyProjectListItemDto,
  type AgencyProjectDto,
  type AgencyProjectListItemDto,
} from "../types/agencyProject.js";
import { HttpError } from "../utils/httpError.js";
import type {
  AssignClientsInput,
  CreateProjectInput,
  ListProjectsQuery,
  UpdateProjectInput,
} from "../validators/agencyProject.schema.js";

export async function createAgencyProjectService(
  organizationId: string,
  createdByOrgUserId: string,
  input: CreateProjectInput,
): Promise<AgencyProjectDto> {
  if (input.startDate && input.endDate && new Date(input.endDate) < new Date(input.startDate)) {
    throw new HttpError(400, "End date must be on or after start date.");
  }

  if (input.clientIds && input.clientIds.length > 0) {
    const check = await assertClientsBelongToOrg(pool, organizationId, input.clientIds);
    if (!check.ok) {
      throw new HttpError(
        400,
        `One or more clients do not belong to this organization: ${check.missing.join(", ")}`,
      );
    }
  }

  const row = await insertAgencyProject(pool, {
    organizationId,
    createdByOrgUserId,
    name: input.name,
    description: input.description ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    status: input.status ?? "active",
    budget: input.budget ?? null,
    currency: input.currency ?? "INR",
  });

  if (input.clientIds && input.clientIds.length > 0) {
    await replaceClientsForProject(pool, organizationId, row.id, input.clientIds);
  }

  return toAgencyProjectDto(row);
}

export async function listAgencyProjectsService(
  organizationId: string,
  query: ListProjectsQuery,
): Promise<AgencyProjectListItemDto[]> {
  const filters: ListProjectsFilters = {
    status: query.status,
    search: query.search,
  };
  const rows = await listAgencyProjectsWithCounts(pool, organizationId, filters);
  return rows.map(toAgencyProjectListItemDto);
}

export async function getAgencyProjectService(
  organizationId: string,
  id: string,
): Promise<AgencyProjectDto> {
  const row = await findAgencyProjectById(pool, organizationId, id);
  if (!row) throw new HttpError(404, "Project not found.");
  return toAgencyProjectDto(row);
}

export async function updateAgencyProjectService(
  organizationId: string,
  id: string,
  input: UpdateProjectInput,
): Promise<AgencyProjectDto> {
  const existing = await findAgencyProjectById(pool, organizationId, id);
  if (!existing) throw new HttpError(404, "Project not found.");

  const patch: UpdateProjectPatch = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description ?? null;
  if (input.startDate !== undefined) patch.start_date = input.startDate;
  if (input.endDate !== undefined) patch.end_date = input.endDate;
  if (input.status !== undefined) patch.status = input.status;
  if (input.budget !== undefined) patch.budget = input.budget;
  if (input.currency !== undefined) patch.currency = input.currency;

  // Cross-field date check against the merged record (covers cases where one
  // side is updated and the other was already set).
  const startSource = patch.start_date ?? existing.start_date;
  const endSource = patch.end_date ?? existing.end_date;
  if (startSource && endSource) {
    const start = startSource instanceof Date ? startSource : new Date(startSource);
    const end = endSource instanceof Date ? endSource : new Date(endSource);
    if (end < start) {
      throw new HttpError(400, "End date must be on or after start date.");
    }
  }

  const updated = await updateAgencyProject(pool, organizationId, id, patch);
  if (!updated) throw new HttpError(404, "Project not found.");
  return toAgencyProjectDto(updated);
}

export async function deleteAgencyProjectService(
  organizationId: string,
  id: string,
): Promise<void> {
  const existing = await findAgencyProjectById(pool, organizationId, id);
  if (!existing) throw new HttpError(404, "Project not found.");
  const removed = await softDeleteAgencyProject(pool, organizationId, id);
  if (!removed) throw new HttpError(404, "Project not found.");
}

export async function listProjectClientsService(
  organizationId: string,
  projectId: string,
): Promise<AgencyClientDto[]> {
  const project = await findAgencyProjectById(pool, organizationId, projectId);
  if (!project) throw new HttpError(404, "Project not found.");
  const rows = await listClientsForProject(pool, organizationId, projectId);
  return rows.map(toAgencyClientDto);
}

export async function assignClientsToProjectService(
  organizationId: string,
  projectId: string,
  input: AssignClientsInput,
): Promise<AgencyClientDto[]> {
  const project = await findAgencyProjectById(pool, organizationId, projectId);
  if (!project) throw new HttpError(404, "Project not found.");

  const check = await assertClientsBelongToOrg(pool, organizationId, input.clientIds);
  if (!check.ok) {
    throw new HttpError(
      400,
      `One or more clients do not belong to this organization: ${check.missing.join(", ")}`,
    );
  }

  await replaceClientsForProject(pool, organizationId, projectId, input.clientIds);
  const rows = await listClientsForProject(pool, organizationId, projectId);
  return rows.map(toAgencyClientDto);
}

export async function removeClientFromProjectService(
  organizationId: string,
  projectId: string,
  clientId: string,
): Promise<void> {
  const project = await findAgencyProjectById(pool, organizationId, projectId);
  if (!project) throw new HttpError(404, "Project not found.");
  const removed = await removeClientFromProject(pool, organizationId, projectId, clientId);
  if (!removed) {
    throw new HttpError(404, "Client is not assigned to this project.");
  }
}
