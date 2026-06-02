import { Router } from "express";

import {
  getPortalInvoiceController,
  getPortalInvoicePdfController,
  markPortalInvoiceViewedController,
} from "../controllers/publicPortal.controller.js";

export const publicPortalRouter = Router();

publicPortalRouter.get("/invoices/:token", getPortalInvoiceController);
publicPortalRouter.get("/invoices/:token/pdf", getPortalInvoicePdfController);
publicPortalRouter.post("/invoices/:token/viewed", markPortalInvoiceViewedController);
