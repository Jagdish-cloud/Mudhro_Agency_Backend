import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";

import { env } from "../config/env.js";
import {
  completeUploadController,
  createDirectController,
  createGroupController,
  deleteMessageController,
  downloadFileController,
  listChatsController,
  listMessagesController,
  listNotificationsController,
  markNotificationsController,
  markReadController,
  searchUsersController,
  sendMessageController,
  unreadSummaryController,
  updateGroupController,
  uploadTokenController,
  uploadChatMultipartController,
} from "../controllers/internalChat.controller.js";

export const internalChatLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
});

export const internalChatHeavyLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
});

const chatFileMultipart = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.CHAT_UPLOAD_MAX_MB * 1024 * 1024 },
});

export const internalChatRouter = Router({ mergeParams: true });

internalChatRouter.use(internalChatLimiter);

internalChatRouter.get("/chats", listChatsController);
internalChatRouter.get("/summary/unread", unreadSummaryController);

internalChatRouter.post("/chats/direct", internalChatHeavyLimiter, createDirectController);
internalChatRouter.post("/chats/group", internalChatHeavyLimiter, createGroupController);
internalChatRouter.put("/chats/group/:chatId", internalChatHeavyLimiter, updateGroupController);

internalChatRouter.get("/chats/:chatId/messages", listMessagesController);
internalChatRouter.post("/messages", internalChatHeavyLimiter, sendMessageController);
internalChatRouter.delete("/messages/:messageId", internalChatHeavyLimiter, deleteMessageController);
internalChatRouter.put("/messages/read", internalChatHeavyLimiter, markReadController);

internalChatRouter.post(
  "/files/upload",
  internalChatHeavyLimiter,
  chatFileMultipart.single("file"),
  uploadChatMultipartController,
);

internalChatRouter.post("/files/upload-token", internalChatHeavyLimiter, uploadTokenController);
internalChatRouter.post("/files/complete-upload", internalChatHeavyLimiter, completeUploadController);
internalChatRouter.get("/files/:fileId/content", downloadFileController);

internalChatRouter.get("/notifications", listNotificationsController);
internalChatRouter.put("/notifications/read", markNotificationsController);

internalChatRouter.get("/users/search", searchUsersController);
