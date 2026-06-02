import { Router } from "express";

import {
  downloadClientReportPdfController,
  downloadOverallReportPdfController,
  downloadPaymentPendingReportPdfController,
  getClientReportController,
  getMonthlyReportController,
  getOverallReportController,
  getPaymentPendingReportController,
} from "../controllers/agencyReport.controller.js";

export const agencyReportRouter = Router({ mergeParams: true });

agencyReportRouter.get("/reports/monthly", getMonthlyReportController);

agencyReportRouter.get("/reports/overall/pdf", downloadOverallReportPdfController);
agencyReportRouter.get("/reports/overall", getOverallReportController);

agencyReportRouter.get("/reports/payment-pending/pdf", downloadPaymentPendingReportPdfController);
agencyReportRouter.get("/reports/payment-pending", getPaymentPendingReportController);

agencyReportRouter.get("/reports/clients/:clientId/pdf", downloadClientReportPdfController);
agencyReportRouter.get("/reports/clients/:clientId", getClientReportController);
