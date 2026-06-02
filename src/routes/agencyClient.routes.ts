import { Router } from "express";

import {
  createClientController,
  deleteClientController,
  getClientController,
  listClientsController,
  updateClientController,
} from "../controllers/agencyClient.controller.js";
import {
  createClientItemController,
  deleteClientItemController,
  getClientItemController,
  listClientItemsController,
  saveInvoiceRowToCatalogController,
  updateClientItemController,
} from "../controllers/agencyClientItem.controller.js";
import { requireOrgAdmin } from "../middlewares/auth.middleware.js";

export const agencyClientRouter = Router({ mergeParams: true });

agencyClientRouter.get("/clients", listClientsController);
agencyClientRouter.get("/clients/:clientId", getClientController);

agencyClientRouter.post("/clients", createClientController);
agencyClientRouter.patch("/clients/:clientId", updateClientController);
agencyClientRouter.delete("/clients/:clientId", requireOrgAdmin, deleteClientController);

// Per-client catalog items. Members are explicitly allowed to CRUD these
// (no requireOrgAdmin) per the updated agency permission policy.
agencyClientRouter.get(
  "/clients/:clientId/items",
  listClientItemsController,
);
agencyClientRouter.post(
  "/clients/:clientId/items",
  createClientItemController,
);
agencyClientRouter.post(
  "/clients/:clientId/items/save-from-row",
  saveInvoiceRowToCatalogController,
);
agencyClientRouter.get(
  "/clients/:clientId/items/:itemId",
  getClientItemController,
);
agencyClientRouter.patch(
  "/clients/:clientId/items/:itemId",
  updateClientItemController,
);
agencyClientRouter.delete(
  "/clients/:clientId/items/:itemId",
  deleteClientItemController,
);
