import type { Request, Response } from "express";

import {
  createAgencyBlobFileService,
  deleteAgencyBlobFileService,
  getAgencyBlobFileService,
  listAgencyBlobFilesService,
  patchAgencyBlobFileService,
} from "../services/agencyBlobFile.service.js";
import { decodeId } from "../utils/idCodec.js";
import { HttpError } from "../utils/httpError.js";
import { created, ok } from "../utils/responses.js";
import {
  createAgencyBlobFileSchema,
  listAgencyBlobFilesQuerySchema,
  patchAgencyBlobFileSchema,
} from "../validators/agencyBlobFile.schema.js";

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

export async function createAgencyBlobFileController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const input = createAgencyBlobFileSchema.parse(req.body);
  const result = await createAgencyBlobFileService(orgId, input);
  res.status(201).json(created(result, "File uploaded."));
}

export async function listAgencyBlobFilesController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const query = listAgencyBlobFilesQuerySchema.parse(req.query);
  const result = await listAgencyBlobFilesService(orgId, query);
  res.status(200).json(ok(result));
}

export async function getAgencyBlobFileController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = decodeId(getParam(req, "fileId"));
  const withUrl = req.query.includeReadUrl === "1" || req.query.includeReadUrl === "true";
  const result = await getAgencyBlobFileService(orgId, id, withUrl);
  res.status(200).json(ok(result));
}

export async function patchAgencyBlobFileController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = decodeId(getParam(req, "fileId"));
  const input = patchAgencyBlobFileSchema.parse(req.body);
  const result = await patchAgencyBlobFileService(orgId, id, input);
  res.status(200).json(ok(result, "File updated."));
}

export async function deleteAgencyBlobFileController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = decodeId(getParam(req, "fileId"));
  await deleteAgencyBlobFileService(orgId, id);
  res.status(200).json(ok({ id }, "File deleted."));
}
