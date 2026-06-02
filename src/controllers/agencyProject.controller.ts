import type { Request, Response } from "express";

import {
  assignClientsToProjectService,
  createAgencyProjectService,
  deleteAgencyProjectService,
  getAgencyProjectService,
  listAgencyProjectsService,
  listProjectClientsService,
  removeClientFromProjectService,
  updateAgencyProjectService,
} from "../services/agencyProject.service.js";
import { decodeId } from "../utils/idCodec.js";
import { HttpError } from "../utils/httpError.js";
import { created, ok } from "../utils/responses.js";
import {
  assignClientsSchema,
  createProjectSchema,
  listProjectsQuerySchema,
  updateProjectSchema,
} from "../validators/agencyProject.schema.js";

function requireAuth(req: Request) {
  if (!req.auth) throw new HttpError(401, "Authentication required.");
  return req.auth;
}

function getParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, `${name} is required.`);
  }
  return value;
}

export async function listProjectsController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const query = listProjectsQuerySchema.parse(req.query);
  const items = await listAgencyProjectsService(orgId, query);
  res.status(200).json(ok(items));
}

export async function createProjectController(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const orgId = getParam(req, "orgId");
  const input = createProjectSchema.parse(req.body);
  const result = await createAgencyProjectService(orgId, auth.id, input);
  res.status(201).json(created(result, "Project created successfully."));
}

export async function getProjectController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = decodeId(getParam(req, "projectId"));
  const result = await getAgencyProjectService(orgId, id);
  res.status(200).json(ok(result));
}

export async function updateProjectController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = decodeId(getParam(req, "projectId"));
  const input = updateProjectSchema.parse(req.body);
  const result = await updateAgencyProjectService(orgId, id, input);
  res.status(200).json(ok(result, "Project updated successfully."));
}

export async function deleteProjectController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = decodeId(getParam(req, "projectId"));
  await deleteAgencyProjectService(orgId, id);
  res.status(200).json(ok({ id }, "Project deleted successfully."));
}

export async function listProjectClientsController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const projectId = decodeId(getParam(req, "projectId"));
  const items = await listProjectClientsService(orgId, projectId);
  res.status(200).json(ok(items));
}

export async function assignProjectClientsController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const projectId = decodeId(getParam(req, "projectId"));
  const input = assignClientsSchema.parse(req.body);
  const items = await assignClientsToProjectService(orgId, projectId, input);
  res.status(200).json(ok(items, "Project clients updated successfully."));
}

export async function removeProjectClientController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const projectId = decodeId(getParam(req, "projectId"));
  const clientId = decodeId(getParam(req, "clientId"));
  await removeClientFromProjectService(orgId, projectId, clientId);
  res.status(200).json(ok({ projectId, clientId }, "Client removed from project."));
}
