import { pool } from "../db/pool.js";
import {
  countActiveAdmins,
  findMemberById,
  insertMember,
  listMembers,
  softDeleteMember,
  updateMember,
  type ListMembersFilters,
  type UpdateMemberPatch,
} from "../repositories/member.repository.js";
import type { AuthPayload, UserRole } from "../types/auth.js";
import { toMemberDto, type MemberDto } from "../types/member.js";
import { HttpError } from "../utils/httpError.js";
import { hashPassword } from "../utils/password.js";
import type {
  CreateAdminInput,
  CreateMemberInput,
  ListMembersQuery,
  UpdateMemberInput,
} from "../validators/member.schema.js";

function mapDuplicateEmail(error: unknown): never {
  const dbError = error as { code?: string; constraint?: string } | undefined;
  if (
    dbError?.code === "23505" &&
    (dbError.constraint === "organization_admins_email_lower_unique" ||
      dbError.constraint === "organization_admins_org_email_unique")
  ) {
    throw new HttpError(409, "This email is already registered.");
  }
  if (dbError?.code === "23514") {
    throw new HttpError(400, "Input violates database constraints.");
  }
  throw error as Error;
}

async function createUserWithRole(
  organizationId: string,
  input: CreateAdminInput | CreateMemberInput,
  role: UserRole,
): Promise<MemberDto> {
  try {
    const passwordHash = await hashPassword(input.password);
    const row = await insertMember(pool, {
      organizationId,
      name: input.name,
      email: input.email,
      number: input.number,
      designation: input.designation,
      passwordHash,
      role,
    });
    return toMemberDto(row);
  } catch (error) {
    mapDuplicateEmail(error);
  }
}

export async function createOrganizationAdmin(
  organizationId: string,
  input: CreateAdminInput,
): Promise<MemberDto> {
  return createUserWithRole(organizationId, input, 1);
}

export async function createOrganizationMember(
  organizationId: string,
  input: CreateMemberInput,
): Promise<MemberDto> {
  return createUserWithRole(organizationId, input, 2);
}

export type ListOrganizationUsersResult = {
  items: MemberDto[];
  total: number;
  page: number;
  limit: number;
};

export async function listOrganizationUsers(
  organizationId: string,
  query: ListMembersQuery,
): Promise<ListOrganizationUsersResult> {
  const filters: ListMembersFilters = {
    role: query.role,
    status: query.status,
    search: query.search,
    page: query.page,
    limit: query.limit,
  };
  const result = await listMembers(pool, organizationId, filters);
  return {
    items: result.items.map(toMemberDto),
    total: result.total,
    page: result.page,
    limit: result.limit,
  };
}

export async function updateOrganizationUser(
  organizationId: string,
  id: string,
  input: UpdateMemberInput,
  actor: AuthPayload,
): Promise<MemberDto> {
  const existing = await findMemberById(pool, organizationId, id);
  if (!existing) {
    throw new HttpError(404, "Member not found.");
  }

  const patch: UpdateMemberPatch = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.number !== undefined) patch.number = input.number;
  if (input.designation !== undefined) patch.designation = input.designation;
  if (input.status !== undefined) patch.status = input.status;

  if (input.role !== undefined && input.role !== existing.role) {
    if (actor.role !== 1) {
      throw new HttpError(403, "Only admins can change roles.");
    }
    if (existing.role === 1 && input.role === 2) {
      const admins = await countActiveAdmins(pool, organizationId);
      if (admins <= 1) {
        throw new HttpError(409, "Cannot demote the last active admin.");
      }
    }
    patch.role = input.role;
  }

  if (
    existing.role === 1 &&
    existing.status === "active" &&
    input.status === "inactive"
  ) {
    const admins = await countActiveAdmins(pool, organizationId);
    if (admins <= 1) {
      throw new HttpError(409, "Cannot deactivate the last active admin.");
    }
  }

  try {
    const updated = await updateMember(pool, organizationId, id, patch);
    if (!updated) {
      throw new HttpError(404, "Member not found.");
    }
    return toMemberDto(updated);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    mapDuplicateEmail(error);
  }
}

export async function deleteOrganizationUser(
  organizationId: string,
  id: string,
): Promise<void> {
  const existing = await findMemberById(pool, organizationId, id);
  if (!existing) {
    throw new HttpError(404, "Member not found.");
  }

  if (existing.role === 1) {
    const admins = await countActiveAdmins(pool, organizationId);
    if (admins <= 1) {
      throw new HttpError(409, "Cannot delete the last active admin.");
    }
  }

  const removed = await softDeleteMember(pool, organizationId, id);
  if (!removed) {
    throw new HttpError(404, "Member not found.");
  }
}
