import type { Request, Response } from "express";

import {
  createAgencyClientItemService,
  getAgencyClientItemService,
  listAgencyClientItemsService,
  softDeleteAgencyClientItemService,
  updateAgencyClientItemService,
  upsertClientItemFromRowService,
} from "../services/agencyClientItem.service.js";
import { HttpError } from "../utils/httpError.js";
import { created, ok } from "../utils/responses.js";
import {
  createClientItemSchema,
  listClientItemsQuerySchema,
  saveInvoiceRowToCatalogSchema,
  updateClientItemSchema,
} from "../validators/agencyClientItem.schema.js";

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

export async function listClientItemsController(
  req: Request,
  res: Response,
): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const clientId = getParam(req, "clientId");
  const query = listClientItemsQuerySchema.parse(req.query);
  const items = await listAgencyClientItemsService(
    orgId,
    clientId,
    query.search,
  );
  res.status(200).json(ok({ items }));
}

export async function getClientItemController(
  req: Request,
  res: Response,
): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const clientId = getParam(req, "clientId");
  const id = getParam(req, "itemId");
  const item = await getAgencyClientItemService(orgId, clientId, id);
  res.status(200).json(ok(item));
}

export async function createClientItemController(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireAuth(req);
  const orgId = getParam(req, "orgId");
  const clientId = getParam(req, "clientId");
  const input = createClientItemSchema.parse(req.body);
  const item = await createAgencyClientItemService(
    orgId,
    auth.id,
    clientId,
    input,
  );
  res.status(201).json(created(item, "Catalog item created successfully."));
}

export async function updateClientItemController(
  req: Request,
  res: Response,
): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const clientId = getParam(req, "clientId");
  const id = getParam(req, "itemId");
  const input = updateClientItemSchema.parse(req.body);
  const item = await updateAgencyClientItemService(
    orgId,
    clientId,
    id,
    input,
  );
  res.status(200).json(ok(item, "Catalog item updated successfully."));
}

export async function deleteClientItemController(
  req: Request,
  res: Response,
): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const clientId = getParam(req, "clientId");
  const id = getParam(req, "itemId");
  await softDeleteAgencyClientItemService(orgId, clientId, id);
  res.status(200).json(ok({ id }, "Catalog item removed."));
}

export async function saveInvoiceRowToCatalogController(
  req: Request,
  res: Response,
): Promise<void> {
  const auth = requireAuth(req);
  const orgId = getParam(req, "orgId");
  const clientId = getParam(req, "clientId");
  const input = saveInvoiceRowToCatalogSchema.parse(req.body);
  const item = await upsertClientItemFromRowService(
    orgId,
    auth.id,
    clientId,
    input,
  );
  res.status(200).json(ok(item, "Saved to client's catalog."));
}
