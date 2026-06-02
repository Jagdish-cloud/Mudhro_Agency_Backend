import type { Response, Request } from "express";

import * as svc from "../services/internalChat.service.js";
import type { AuthPayload } from "../types/auth.js";
import { HttpError } from "../utils/httpError.js";
import { created, ok } from "../utils/responses.js";
import {
  completeUploadBodySchema,
  createDirectChatBodySchema,
  createGroupChatBodySchema,
  listChatsQuerySchema,
  listMessagesQuerySchema,
  markReadBodySchema,
  notificationsReadBodySchema,
  sendMessageBodySchema,
  updateGroupChatBodySchema,
  uploadChatFileTokenBodySchema,
} from "../validators/internalChat.schema.js";

function requireOrgParam(req: Request): { orgId: string; auth: AuthPayload } {
  if (!req.auth) throw new HttpError(401, "Authentication required.");
  const orgId = typeof req.params.orgId === "string" ? req.params.orgId : "";
  if (!orgId) throw new HttpError(400, "orgId is required.");
  if (orgId !== req.auth.organizationId) throw new HttpError(403, "Organization scope mismatch.");
  return { orgId, auth: req.auth };
}

export async function listChatsController(req: Request, res: Response): Promise<void> {
  const { orgId, auth } = requireOrgParam(req);
  const query = listChatsQuerySchema.parse(req.query);
  const result = await svc.listChatsService(orgId, auth.id, query.search, query.cursor, query.limit);
  res.status(200).json(ok(result));
}

export async function createDirectController(req: Request, res: Response): Promise<void> {
  const { orgId, auth } = requireOrgParam(req);
  const body = createDirectChatBodySchema.parse(req.body);
  const createdRow = await svc.createDirectChatService(orgId, auth, body.peerOrganizationUserId);
  res.status(201).json(created(createdRow));
}

export async function createGroupController(req: Request, res: Response): Promise<void> {
  const { orgId, auth } = requireOrgParam(req);
  const body = createGroupChatBodySchema.parse(req.body);
  const createdRow = await svc.createGroupChatService(orgId, auth, body.name, body.memberOrganizationUserIds, body.imageFileId);
  res.status(201).json(created(createdRow));
}

export async function updateGroupController(req: Request, res: Response): Promise<void> {
  const { orgId, auth } = requireOrgParam(req);
  const chatId = typeof req.params.chatId === "string" ? req.params.chatId : "";
  if (!chatId) throw new HttpError(400, "chatId is required.");
  const body = updateGroupChatBodySchema.parse(req.body);
  await svc.updateGroupChatService(orgId, chatId, auth, body);
  res.status(200).json(ok({ ok: true }));
}

export async function listMessagesController(req: Request, res: Response): Promise<void> {
  const { orgId, auth } = requireOrgParam(req);
  const chatId = typeof req.params.chatId === "string" ? req.params.chatId : "";
  if (!chatId) throw new HttpError(400, "chatId is required.");
  const query = listMessagesQuerySchema.parse(req.query);
  const msgs = await svc.listMessagesService(orgId, chatId, auth.id, query.before, query.limit);
  res.status(200).json(ok({ messages: msgs }));
}

export async function sendMessageController(req: Request, res: Response): Promise<void> {
  const { orgId, auth } = requireOrgParam(req);
  const body = sendMessageBodySchema.parse(req.body);
  const result = await svc.insertMessageCore(orgId, auth.id, {
    chatId: body.chatId,
    messageType: body.messageType,
    bodyText: body.bodyText,
    fileId: body.fileId,
    replyMessageId: body.replyMessageId,
    clientMessageId: body.clientMessageId,
    mentionedOrganizationUserIds: body.mentionedOrganizationUserIds,
  });
  res.status(201).json(created(result.dto));
}

export async function deleteMessageController(req: Request, res: Response): Promise<void> {
  const { orgId, auth } = requireOrgParam(req);
  const messageId = typeof req.params.messageId === "string" ? req.params.messageId : "";
  if (!messageId) throw new HttpError(400, "messageId is required.");
  await svc.softDeleteMyMessageService(orgId, auth, messageId);
  res.status(200).json(ok({ ok: true }));
}

export async function markReadController(req: Request, res: Response): Promise<void> {
  const { orgId, auth } = requireOrgParam(req);
  const body = markReadBodySchema.parse(req.body);
  await svc.markReadService(orgId, auth.id, body.chatId, body.readUpToMessageId);
  res.status(200).json(ok({ ok: true }));
}

export async function uploadTokenController(req: Request, res: Response): Promise<void> {
  const { orgId, auth } = requireOrgParam(req);
  const body = uploadChatFileTokenBodySchema.parse(req.body);
  const tok = await svc.createChatUploadTokenService(orgId, auth.id, body.originalName, body.mimeType, body.byteSize);
  res.status(200).json(ok(tok));
}

export async function completeUploadController(req: Request, res: Response): Promise<void> {
  const { orgId, auth } = requireOrgParam(req);
  const body = completeUploadBodySchema.parse(req.body);
  const out = await svc.completeChatUploadService(orgId, auth.id, body);
  res.status(201).json(created(out));
}

/** Multipart POST (same-origin) — avoids browser CORS PUT to Azure blob SAS. */
export async function uploadChatMultipartController(req: Request, res: Response): Promise<void> {
  const { orgId, auth } = requireOrgParam(req);
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file?.buffer?.length) {
    throw new HttpError(400, 'Multipart field "file" is required.');
  }
  const createdRow = await svc.uploadChatFileViaServerService(orgId, auth.id, {
    buffer: file.buffer,
    size: file.size,
    mimetype: file.mimetype,
    originalname: file.originalname ?? undefined,
  });
  res.status(201).json(created(createdRow));
}

export async function downloadFileController(req: Request, res: Response): Promise<void> {
  const { orgId, auth } = requireOrgParam(req);
  const fileId = typeof req.params.fileId === "string" ? req.params.fileId : "";
  if (!fileId) throw new HttpError(400, "fileId is required.");
  const { buffer, filename, mimeType } = await svc.downloadChatFileBufferService(orgId, auth.id, fileId);
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.status(200).send(Buffer.from(buffer));
}

export async function listNotificationsController(req: Request, res: Response): Promise<void> {
  const { auth } = requireOrgParam(req);
  const items = await svc.listNotificationsService(auth.id);
  res.status(200).json(ok({ notifications: items }));
}

export async function markNotificationsController(req: Request, res: Response): Promise<void> {
  const { auth } = requireOrgParam(req);
  const body = notificationsReadBodySchema.parse(req.body);
  await svc.markNotificationsReadService(auth.id, body.notificationIds);
  res.status(200).json(ok({ ok: true }));
}

export async function searchUsersController(req: Request, res: Response): Promise<void> {
  const { orgId } = requireOrgParam(req);
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const users = await svc.searchUsersInternalChat(orgId, q);
  res.status(200).json(ok({ users }));
}

export async function unreadSummaryController(req: Request, res: Response): Promise<void> {
  const { orgId, auth } = requireOrgParam(req);
  const total = await svc.getUnreadTotalService(orgId, auth.id);
  res.status(200).json(ok({ totalUnreadMessages: total }));
}
