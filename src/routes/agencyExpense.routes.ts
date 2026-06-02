import { Router } from "express";
import multer from "multer";

import {
  createExpenseController,
  createExpenseItemNestedController,
  createExpenseServiceController,
  deleteExpenseController,
  deleteExpenseItemController,
  deleteExpenseServiceController,
  downloadExpenseAttachmentController,
  downloadExpensePdfController,
  getExpenseController,
  getExpenseItemController,
  getExpenseServiceController,
  listExpenseItemsNestedController,
  listExpensesByProjectController,
  listExpensesController,
  listExpenseServicesController,
  trackExpenseVisitController,
  updateExpenseController,
  updateExpenseItemController,
  updateExpenseServiceController,
  uploadExpenseAttachmentController,
  uploadExpensePdfController,
} from "../controllers/agencyExpense.controller.js";
import { MAX_ATTACHMENT_SIZE_BYTES } from "../utils/files.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
});

const expenseNestedRouter = Router({ mergeParams: true });

expenseNestedRouter.post("/items", createExpenseItemNestedController);
expenseNestedRouter.get("/items", listExpenseItemsNestedController);
expenseNestedRouter.post(
  "/attachment",
  upload.single("attachment"),
  uploadExpenseAttachmentController,
);
expenseNestedRouter.post("/pdf", upload.single("expensePdf"), uploadExpensePdfController);
expenseNestedRouter.get("/pdf", downloadExpensePdfController);
expenseNestedRouter.get("/attachment", downloadExpenseAttachmentController);
expenseNestedRouter.get("/", getExpenseController);
expenseNestedRouter.put("/", updateExpenseController);
expenseNestedRouter.delete("/", deleteExpenseController);

export const agencyExpenseRouter = Router({ mergeParams: true });

agencyExpenseRouter.post("/track-expense-visit", trackExpenseVisitController);

agencyExpenseRouter.get("/expenses/project/:projectId", listExpensesByProjectController);

agencyExpenseRouter.get("/expense-services", listExpenseServicesController);
agencyExpenseRouter.post("/expense-services", createExpenseServiceController);
agencyExpenseRouter.get("/expense-services/:serviceId", getExpenseServiceController);
agencyExpenseRouter.put("/expense-services/:serviceId", updateExpenseServiceController);
agencyExpenseRouter.delete("/expense-services/:serviceId", deleteExpenseServiceController);

agencyExpenseRouter.get("/expense-items/:itemId", getExpenseItemController);
agencyExpenseRouter.put("/expense-items/:itemId", updateExpenseItemController);
agencyExpenseRouter.delete("/expense-items/:itemId", deleteExpenseItemController);

agencyExpenseRouter.get("/expenses", listExpensesController);
agencyExpenseRouter.post("/expenses", createExpenseController);
agencyExpenseRouter.use("/expenses/:expenseId", expenseNestedRouter);
