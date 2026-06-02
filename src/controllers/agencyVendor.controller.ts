import type { Request, Response } from "express";

import {
  createAgencyVendorService,
  deleteAgencyVendorService,
  getAgencyVendorService,
  listAgencyVendorsService,
  updateAgencyVendorService,
} from "../services/agencyVendor.service.js";
import { HttpError } from "../utils/httpError.js";
import { created, ok } from "../utils/responses.js";
import {
  createVendorSchema,
  listVendorsQuerySchema,
  updateVendorSchema,
} from "../validators/agencyVendor.schema.js";

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

export async function createVendorController(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const orgId = getParam(req, "orgId");
  const input = createVendorSchema.parse(req.body);
  const result = await createAgencyVendorService(orgId, auth.id, input);
  res.status(201).json(created(result, "Vendor created successfully."));
}

export async function listVendorsController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const query = listVendorsQuerySchema.parse(req.query);
  const result = await listAgencyVendorsService(orgId, query);
  res.status(200).json(ok(result));
}

export async function getVendorController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = getParam(req, "vendorId");
  const result = await getAgencyVendorService(orgId, id);
  res.status(200).json(ok(result));
}

export async function updateVendorController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = getParam(req, "vendorId");
  const input = updateVendorSchema.parse(req.body);
  const result = await updateAgencyVendorService(orgId, id, input);
  res.status(200).json(ok(result, "Vendor updated successfully."));
}

export async function deleteVendorController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = getParam(req, "vendorId");
  await deleteAgencyVendorService(orgId, id);
  res.status(200).json(ok({ id }, "Vendor archived successfully."));
}
