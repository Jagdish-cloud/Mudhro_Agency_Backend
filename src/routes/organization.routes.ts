import { Router } from "express";

import {
  getOrganizationController,
  registerOrganizationController,
} from "../controllers/organization.controller.js";
import { requireAuth, requireSameOrg } from "../middlewares/auth.middleware.js";
import { agencyAgreementRouter } from "./agencyAgreement.routes.js";
import { agencyBlobFileRouter } from "./agencyBlobFile.routes.js";
import { agencyClientRouter } from "./agencyClient.routes.js";
import { agencyExpenseRouter } from "./agencyExpense.routes.js";
import { agencyInvoiceRouter } from "./agencyInvoice.routes.js";
import { agencyProjectRouter } from "./agencyProject.routes.js";
import { agencyReportRouter } from "./agencyReport.routes.js";
import { agencyVendorRouter } from "./agencyVendor.routes.js";
import { internalChatRouter } from "./internalChat.routes.js";
import { memberRouter } from "./member.routes.js";

export const organizationRouter = Router();

organizationRouter.post("/register", registerOrganizationController);

organizationRouter.get("/:orgId", requireAuth, requireSameOrg, getOrganizationController);
organizationRouter.use("/:orgId", requireAuth, requireSameOrg, memberRouter);
organizationRouter.use("/:orgId", requireAuth, requireSameOrg, agencyClientRouter);
organizationRouter.use("/:orgId", requireAuth, requireSameOrg, agencyVendorRouter);
organizationRouter.use("/:orgId", requireAuth, requireSameOrg, agencyExpenseRouter);
organizationRouter.use("/:orgId", requireAuth, requireSameOrg, agencyInvoiceRouter);
organizationRouter.use("/:orgId", requireAuth, requireSameOrg, agencyProjectRouter);
organizationRouter.use("/:orgId", requireAuth, requireSameOrg, agencyAgreementRouter);
organizationRouter.use("/:orgId", requireAuth, requireSameOrg, agencyBlobFileRouter);
organizationRouter.use("/:orgId", requireAuth, requireSameOrg, agencyReportRouter);
organizationRouter.use("/:orgId/internal-chat", requireAuth, requireSameOrg, internalChatRouter);
