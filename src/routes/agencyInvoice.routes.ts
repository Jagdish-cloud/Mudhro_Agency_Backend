import { Router } from "express";
import multer from "multer";

import {
  cancelReminderController,
  createInvoiceController,
  createReminderController,
  deleteInvoiceController,
  downloadInvoicePdfController,
  getInvoiceController,
  listInvoicesController,
  listPaymentsController,
  listRemindersController,
  recordPaymentController,
  rotatePortalTokenController,
  sendInvoiceController,
  updateInvoiceController,
} from "../controllers/agencyInvoice.controller.js";
import {
  deleteAttachmentController,
  downloadAttachmentController,
  listAttachmentsController,
  uploadAttachmentController,
} from "../controllers/agencyAttachment.controller.js";
import { requireOrgAdmin } from "../middlewares/auth.middleware.js";
import { MAX_ATTACHMENT_SIZE_BYTES } from "../utils/files.js";

export const agencyInvoiceRouter = Router({ mergeParams: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
});

agencyInvoiceRouter.get("/invoices", listInvoicesController);
agencyInvoiceRouter.post("/invoices", createInvoiceController);

agencyInvoiceRouter.get("/invoices/:invoiceId", getInvoiceController);
agencyInvoiceRouter.patch("/invoices/:invoiceId", updateInvoiceController);
agencyInvoiceRouter.delete(
  "/invoices/:invoiceId",
  requireOrgAdmin,
  deleteInvoiceController,
);

// Sending emails, recording payments, rotating portal tokens, and managing
// reminders/attachments are admin-only. Members are restricted to
// view/create/edit of invoices, clients, and expenses.
agencyInvoiceRouter.post(
  "/invoices/:invoiceId/send",
  requireOrgAdmin,
  sendInvoiceController,
);
agencyInvoiceRouter.get("/invoices/:invoiceId/pdf", downloadInvoicePdfController);
agencyInvoiceRouter.post(
  "/invoices/:invoiceId/portal-token/rotate",
  requireOrgAdmin,
  rotatePortalTokenController,
);

agencyInvoiceRouter.get("/invoices/:invoiceId/payments", listPaymentsController);
agencyInvoiceRouter.post(
  "/invoices/:invoiceId/payments",
  requireOrgAdmin,
  recordPaymentController,
);

agencyInvoiceRouter.get("/invoices/:invoiceId/reminders", listRemindersController);
agencyInvoiceRouter.post(
  "/invoices/:invoiceId/reminders",
  requireOrgAdmin,
  createReminderController,
);
agencyInvoiceRouter.delete(
  "/invoices/:invoiceId/reminders/:reminderId",
  requireOrgAdmin,
  cancelReminderController,
);

agencyInvoiceRouter.get(
  "/invoices/:invoiceId/attachments",
  listAttachmentsController,
);
agencyInvoiceRouter.post(
  "/invoices/:invoiceId/attachments",
  requireOrgAdmin,
  upload.single("file"),
  uploadAttachmentController,
);
agencyInvoiceRouter.get(
  "/invoices/:invoiceId/attachments/:attachmentId/download",
  downloadAttachmentController,
);
agencyInvoiceRouter.delete(
  "/invoices/:invoiceId/attachments/:attachmentId",
  requireOrgAdmin,
  deleteAttachmentController,
);
