import { Router } from "express";

import {
  createVendorController,
  deleteVendorController,
  getVendorController,
  listVendorsController,
  updateVendorController,
} from "../controllers/agencyVendor.controller.js";
import {
  createVendorItemController,
  deleteVendorItemController,
  getVendorItemController,
  listVendorItemsController,
  updateVendorItemController,
} from "../controllers/agencyVendorItem.controller.js";
import { requireOrgAdmin } from "../middlewares/auth.middleware.js";

export const agencyVendorRouter = Router({ mergeParams: true });

agencyVendorRouter.get("/vendors", listVendorsController);
agencyVendorRouter.get("/vendors/:vendorId", getVendorController);

agencyVendorRouter.post("/vendors", createVendorController);
agencyVendorRouter.patch("/vendors/:vendorId", updateVendorController);
agencyVendorRouter.delete("/vendors/:vendorId", requireOrgAdmin, deleteVendorController);

agencyVendorRouter.get("/vendors/:vendorId/items", listVendorItemsController);
agencyVendorRouter.post("/vendors/:vendorId/items", createVendorItemController);
agencyVendorRouter.get("/vendors/:vendorId/items/:itemId", getVendorItemController);
agencyVendorRouter.patch("/vendors/:vendorId/items/:itemId", updateVendorItemController);
agencyVendorRouter.delete("/vendors/:vendorId/items/:itemId", deleteVendorItemController);
