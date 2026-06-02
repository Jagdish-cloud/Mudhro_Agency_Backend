import type { Request, Response } from "express";

import {
  createAgencyClientService,
  deleteAgencyClientService,
  getAgencyClientService,
  listAgencyClientsService,
  updateAgencyClientService,
} from "../services/agencyClient.service.js";
import { HttpError } from "../utils/httpError.js";
import { created, ok } from "../utils/responses.js";
import {
  createClientSchema,
  listClientsQuerySchema,
  updateClientSchema,
} from "../validators/agencyClient.schema.js";

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

export async function createClientController(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const orgId = getParam(req, "orgId");
  const input = createClientSchema.parse(req.body);
  const result = await createAgencyClientService(orgId, auth.id, input);
  res.status(201).json(created(result, "Client created successfully."));
}

export async function listClientsController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const query = listClientsQuerySchema.parse(req.query);
  const result = await listAgencyClientsService(orgId, query);
  res.status(200).json(ok(result));
}

export async function getClientController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = getParam(req, "clientId");
  const result = await getAgencyClientService(orgId, id);
  res.status(200).json(ok(result));
}

export async function updateClientController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = getParam(req, "clientId");
  const input = updateClientSchema.parse(req.body);
  const result = await updateAgencyClientService(orgId, id, input);
  res.status(200).json(ok(result, "Client updated successfully."));
}

export async function deleteClientController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = getParam(req, "clientId");
  await deleteAgencyClientService(orgId, id);
  res.status(200).json(ok({ id }, "Client archived successfully."));
}
