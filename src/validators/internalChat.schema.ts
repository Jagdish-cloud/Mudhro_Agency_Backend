import { z } from "zod";

export const listChatsQuerySchema = z.object({
  search: z.string().max(200).optional(),
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const createDirectChatBodySchema = z.object({
  peerOrganizationUserId: z.string().uuid(),
});

export const createGroupChatBodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  memberOrganizationUserIds: z.array(z.string().uuid()).min(1).max(200),
  imageFileId: z.string().uuid().optional(),
});

export const updateGroupChatBodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  imageFileId: z.string().uuid().nullable().optional(),
  addMemberOrganizationUserIds: z.array(z.string().uuid()).max(100).optional(),
  removeMemberOrganizationUserIds: z.array(z.string().uuid()).max(100).optional(),
  promoteOrganizationUserIds: z.array(z.string().uuid()).max(50).optional(),
});

export const listMessagesQuerySchema = z.object({
  before: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const sendMessageBodySchema = z.object({
  chatId: z.string().uuid(),
  messageType: z.enum(["text", "file", "image", "system"]),
  bodyText: z.string().max(16000).optional(),
  fileId: z.string().uuid().optional(),
  replyMessageId: z.string().uuid().optional(),
  clientMessageId: z.string().max(128).optional(),
  mentionedOrganizationUserIds: z.array(z.string().uuid()).max(50).optional(),
});

export const markReadBodySchema = z.object({
  chatId: z.string().uuid(),
  readUpToMessageId: z.string().uuid(),
});

export const uploadChatFileTokenBodySchema = z.object({
  originalName: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(200),
  byteSize: z.coerce.number().int().positive(),
});

export const completeUploadBodySchema = z.object({
  storedName: z.string().min(1).max(500),
  blobPath: z.string().min(1).max(2000),
  originalName: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(200),
  byteSize: z.coerce.number().int().positive(),
});

export const notificationsReadBodySchema = z.object({
  notificationIds: z.array(z.string().uuid()).min(1).max(200),
});
