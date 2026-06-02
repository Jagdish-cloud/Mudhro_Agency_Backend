import type { Request, Response } from "express";

import {
  createOrganizationAdmin,
  createOrganizationMember,
  deleteOrganizationUser,
  listOrganizationUsers,
  updateOrganizationUser,
} from "../services/member.service.js";
import { HttpError } from "../utils/httpError.js";
import { created, ok } from "../utils/responses.js";
import {
  createAdminSchema,
  createMemberSchema,
  listMembersQuerySchema,
  updateMemberSchema,
} from "../validators/member.schema.js";

function getParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, `${name} is required.`);
  }
  return value;
}

function getOrgId(req: Request): string {
  return getParam(req, "orgId");
}

export async function createAdminController(req: Request, res: Response): Promise<void> {
  const orgId = getOrgId(req);
  const input = createAdminSchema.parse(req.body);
  const result = await createOrganizationAdmin(orgId, input);
  res.status(201).json(created(result, "Admin created successfully."));
}

export async function createMemberController(req: Request, res: Response): Promise<void> {
  const orgId = getOrgId(req);
  const input = createMemberSchema.parse(req.body);
  const result = await createOrganizationMember(orgId, input);
  res.status(201).json(created(result, "Member created successfully."));
}

export async function listMembersController(req: Request, res: Response): Promise<void> {
  const orgId = getOrgId(req);
  const query = listMembersQuerySchema.parse(req.query);
  const result = await listOrganizationUsers(orgId, query);
  res.status(200).json(ok(result));
}

export async function updateMemberController(req: Request, res: Response): Promise<void> {
  const orgId = getOrgId(req);
  const id = getParam(req, "id");
  const input = updateMemberSchema.parse(req.body);
  if (!req.auth) {
    throw new HttpError(401, "Authentication required.");
  }
  const result = await updateOrganizationUser(orgId, id, input, req.auth);
  res.status(200).json(ok(result, "Member updated successfully."));
}

export async function deleteMemberController(req: Request, res: Response): Promise<void> {
  const orgId = getOrgId(req);
  const id = getParam(req, "id");
  await deleteOrganizationUser(orgId, id);
  res.status(200).json(ok({ id }, "Member removed successfully."));
}
