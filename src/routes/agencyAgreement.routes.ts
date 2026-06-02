import { Router } from "express";

import {
  createAgreementController,
  deleteAgreementController,
  getAgreementByProjectController,
  getAgreementController,
  getAgreementPdfController,
  sendAgreementController,
  updateAgreementController,
} from "../controllers/agencyAgreement.controller.js";

export const agencyAgreementRouter = Router({ mergeParams: true });

agencyAgreementRouter.post(
  "/projects/:projectId/agreements",
  createAgreementController,
);
agencyAgreementRouter.get(
  "/projects/:projectId/agreement",
  getAgreementByProjectController,
);
agencyAgreementRouter.get("/agreements/:agreementId", getAgreementController);
agencyAgreementRouter.patch("/agreements/:agreementId", updateAgreementController);
agencyAgreementRouter.delete("/agreements/:agreementId", deleteAgreementController);
agencyAgreementRouter.get(
  "/agreements/:agreementId/pdf",
  getAgreementPdfController,
);
agencyAgreementRouter.post(
  "/agreements/:agreementId/send",
  sendAgreementController,
);
