import type { Request, Response } from "express";

import {
  createAgencyVendorItemService,
  getAgencyVendorItemService,
  listAgencyVendorItemsService,
  softDeleteAgencyVendorItemService,
  updateAgencyVendorItemService,
} from "../services/agencyVendorItem.service.js";
import { HttpError } from "../utils/httpError.js";
import { created, ok } from "../utils/responses.js";
import {
  createVendorItemSchema,
  listVendorItemsQuerySchema,
  updateVendorItemSchema,
} from "../validators/agencyVendorItem.schema.js";

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

export async function listVendorItemsController(
  req: Request,
  res: Response,
): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const vendorId = getParam(req, "vendorId");
  const query = listVendorItemsQuerySchema.parse(req.query);
  const items = await listAgencyVendorItemsService(orgId, vendorId, query.search);
  res.status(200).json(ok({ items }));
}

export async function getVendorItemController(
  req: Request,
  res: Response,
): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const vendorId = getParam(req, "vendorId");
  const id = getParam(req, "itemId");
  const item = await getAgencyVendorItemService(orgId, vendorId, id);
  res.status(200).json(ok(item));
}

export async function createVendorItemController(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireAuth(req);
  const orgId = getParam(req, "orgId");
  const vendorId = getParam(req, "vendorId");
  const input = createVendorItemSchema.parse(req.body);
  const item = await createAgencyVendorItemService(orgId, auth.id, vendorId, input);
  res.status(201).json(created(item, "Catalog item created successfully."));
}

export async function updateVendorItemController(
  req: Request,
  res: Response,
): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const vendorId = getParam(req, "vendorId");
  const id = getParam(req, "itemId");
  const input = updateVendorItemSchema.parse(req.body);
  const item = await updateAgencyVendorItemService(orgId, vendorId, id, input);
  res.status(200).json(ok(item, "Catalog item updated successfully."));
}

export async function deleteVendorItemController(
  req: Request,
  res: Response,
): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const vendorId = getParam(req, "vendorId");
  const id = getParam(req, "itemId");
  await softDeleteAgencyVendorItemService(orgId, vendorId, id);
  res.status(200).json(ok({ id }, "Catalog item removed successfully."));
}
