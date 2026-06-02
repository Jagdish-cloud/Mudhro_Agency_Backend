import { Router } from "express";

import {
  getPortalAgreementController,
  getPortalAgreementPdfController,
  patchPortalAgreementController,
  postPortalAgreementController,
} from "../controllers/agreementPortal.controller.js";

export const agreementPortalRouter = Router();

agreementPortalRouter.get("/:token/pdf", getPortalAgreementPdfController);
agreementPortalRouter.get("/:token", getPortalAgreementController);
agreementPortalRouter.post("/:token", postPortalAgreementController);
agreementPortalRouter.patch("/:token", patchPortalAgreementController);
