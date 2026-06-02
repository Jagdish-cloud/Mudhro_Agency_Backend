import bcrypt from "bcryptjs";

import { pool } from "../db/pool.js";
import {
  findMemberById,
  getAdminPasswordHashById,
  updateAdminPasswordHashById,
  updateMember,
  type UpdateMemberPatch,
} from "../repositories/member.repository.js";
import type { AuthPayload } from "../types/auth.js";
import { toMemberDto, type MemberDto } from "../types/member.js";
import { HttpError } from "../utils/httpError.js";
import { hashPassword } from "../utils/password.js";
import type {
  ChangePasswordInput,
  UpdateSelfProfileInput,
} from "../validators/profile.schema.js";

export async function getMyProfileService(actor: AuthPayload): Promise<MemberDto> {
  const row = await findMemberById(pool, actor.organizationId, actor.id);
  if (!row) {
    throw new HttpError(401, "Session is no longer valid. Please sign in again.");
  }
  return toMemberDto(row);
}

export async function updateMyProfileService(
  actor: AuthPayload,
  input: UpdateSelfProfileInput,
): Promise<MemberDto> {
  const patch: UpdateMemberPatch = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.number !== undefined) patch.number = input.number;
  // Only admins (role=1) can self-edit designation. Members must ask an admin.
  if (input.designation !== undefined && actor.role === 1) {
    patch.designation = input.designation;
  }

  if (Object.keys(patch).length === 0) {
    const row = await findMemberById(pool, actor.organizationId, actor.id);
    if (!row) {
      throw new HttpError(401, "Session is no longer valid. Please sign in again.");
    }
    return toMemberDto(row);
  }

  const updated = await updateMember(pool, actor.organizationId, actor.id, patch);
  if (!updated) {
    throw new HttpError(401, "Session is no longer valid. Please sign in again.");
  }
  return toMemberDto(updated);
}

export async function changeMyPasswordService(
  actor: AuthPayload,
  input: ChangePasswordInput,
): Promise<void> {
  const currentHash = await getAdminPasswordHashById(pool, actor.organizationId, actor.id);
  if (!currentHash) {
    throw new HttpError(401, "Session is no longer valid. Please sign in again.");
  }

  const currentOk = await bcrypt.compare(input.currentPassword, currentHash);
  if (!currentOk) {
    throw new HttpError(401, "Current password is incorrect.");
  }

  const newHash = await hashPassword(input.newPassword);
  const updated = await updateAdminPasswordHashById(pool, actor.organizationId, actor.id, newHash);
  if (!updated) {
    throw new HttpError(401, "Session is no longer valid. Please sign in again.");
  }
}
