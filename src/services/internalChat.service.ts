import { randomUUID } from "node:crypto";

import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import * as repo from "../repositories/internalChat.repository.js";
import { getInternalChatNsp } from "../sockets/internalChatSocket.registry.js";
import {
  getBlobContentProperties,
  getBlobUploadSasUrl,
  uploadBuffer,
  downloadBlobBuffer,
  internalChatBlobPath,
  isAzureConfigured,
} from "../services/azureBlob.service.js";
import type { AuthPayload } from "../types/auth.js";
import { HttpError } from "../utils/httpError.js";

const ALLOWED_CHAT_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
]);

function mimeTypeFromBasename(originalName: string): string | undefined {
  const dot = originalName.lastIndexOf(".");
  if (dot < 0 || dot === originalName.length - 1) return undefined;
  const ext = originalName.slice(dot).toLowerCase();
  const known: Record<string, string> = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".zip": "application/zip",
    ".txt": "text/plain",
  };
  return known[ext];
}

export function retentionSinceDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() - env.CHAT_RETENTION_DAYS);
  return d;
}

export function sanitizeChatPlainText(raw: string | undefined): string {
  if (!raw) return "";
  return raw.replace(/\r\n/g, "\n").trim().slice(0, 16000);
}

export function assertAllowedChatMime(mime: string): void {
  const m = mime.trim().toLowerCase();
  if (!ALLOWED_CHAT_MIMES.has(m)) {
    throw new HttpError(400, "File type is not allowed for chat uploads.");
  }
}

export type ChatMessageDto = {
  id: string;
  chatId: string;
  senderOrganizationUserId: string;
  messageType: string;
  bodyText: string | null;
  file: null | {
    id: string;
    originalName: string;
    mimeType: string;
    byteSize: number;
  };
  replyMessageId: string | null;
  edited: boolean;
  deleted: boolean;
  clientMessageId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ChatListItemDto = {
  id: string;
  type: string;
  title: string;
  groupName: string | null;
  groupImageBlobPath: string | null;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  updatedAt: string;
  memberCount: number;
  onlinePeer: boolean | null;
  peerUserId: string | null;
};

function toMessageDto(
  row: repo.ChatMessageRow,
  file: repo.ChatFileRow | null,
): ChatMessageDto {
  return {
    id: row.id,
    chatId: row.chat_id,
    senderOrganizationUserId: row.sender_organization_user_id,
    messageType: row.message_type,
    bodyText: row.body_text,
    file: file
      ? {
          id: file.id,
          originalName: file.original_name,
          mimeType: file.mime_type,
          byteSize: Number(file.byte_size),
        }
      : null,
    replyMessageId: row.reply_message_id,
    edited: row.edited,
    deleted: row.deleted,
    clientMessageId: row.client_message_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
  };
}

async function resolveDmPeerId(chat: repo.ChatRow, viewerId: string): Promise<string | null> {
  if (chat.type !== "direct" || !chat.dm_user_low || !chat.dm_user_high) return null;
  if (chat.dm_user_low === viewerId) return chat.dm_user_high;
  if (chat.dm_user_high === viewerId) return chat.dm_user_low;
  return null;
}

export async function listChatsService(
  organizationId: string,
  viewerId: string,
  search: string | undefined,
  cursorIso: string | undefined,
  limit: number,
): Promise<{ items: ChatListItemDto[]; nextCursor: string | null }> {
  const retention = retentionSinceDate();
  const cursorDate = cursorIso ? new Date(cursorIso) : undefined;
  const rows = await repo.listChatsForUser(pool, organizationId, viewerId, search, retention, cursorDate, limit);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const chatIds = page.map((r) => r.chat_row.id);
  const memberCounts = new Map<string, number>();
  if (chatIds.length > 0) {
    const mc = await pool.query<{ chat_id: string; c: string }>(
      `SELECT chat_id, COUNT(*)::text AS c FROM internal_chat_members WHERE chat_id = ANY($1::uuid[]) GROUP BY chat_id`,
      [chatIds],
    );
    for (const row of mc.rows) memberCounts.set(row.chat_id, Number(row.c));
  }

  const peerIds = new Set<string>();
  for (const { chat_row: c } of page) {
    const p = await resolveDmPeerId(c, viewerId);
    if (p) peerIds.add(p);
  }
  const peerOnline = new Map<string, boolean>();
  if (peerIds.size > 0) {
    const pr = await pool.query<{ id: string; is_online: boolean }>(
      `SELECT id, is_online FROM organization_admins WHERE id = ANY($1::uuid[])`,
      [[...peerIds]],
    );
    for (const row of pr.rows) peerOnline.set(row.id, row.is_online);
  }

  const peerNames = new Map<string, string>();
  if (peerIds.size > 0) {
    const pr = await pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM organization_admins WHERE id = ANY($1::uuid[])`,
      [[...peerIds]],
    );
    for (const row of pr.rows) peerNames.set(row.id, row.name);
  }

  const items: ChatListItemDto[] = [];
  for (const row of page) {
    const c = row.chat_row;
    let title = c.group_name ?? "Group";
    let peerId: string | null = null;
    let onlinePeer: boolean | null = null;
    if (c.type === "direct") {
      peerId = await resolveDmPeerId(c, viewerId);
      title = peerId ? (peerNames.get(peerId) ?? "Direct message") : "Direct message";
      onlinePeer = peerId != null ? (peerOnline.get(peerId) ?? false) : null;
    }
    items.push({
      id: c.id,
      type: c.type,
      title,
      groupName: c.group_name,
      groupImageBlobPath: c.group_image_blob_path,
      unreadCount: row.unread,
      lastMessagePreview: row.last_body,
      lastMessageAt: row.last_message_at ? row.last_message_at.toISOString() : null,
      updatedAt: c.updated_at.toISOString(),
      memberCount: memberCounts.get(c.id) ?? 0,
      onlinePeer,
      peerUserId: peerId,
    });
  }

  const nextCursor = hasMore ? page[page.length - 1]?.chat_row.updated_at.toISOString() ?? null : null;
  return { items, nextCursor };
}

export async function createDirectChatService(
  organizationId: string,
  actor: AuthPayload,
  peerOrganizationUserId: string,
): Promise<{ chatId: string }> {
  if (peerOrganizationUserId === actor.id) {
    throw new HttpError(400, "Cannot start a direct chat with yourself.");
  }
  const peer = await repo.findActiveOrgUser(pool, organizationId, peerOrganizationUserId);
  if (!peer) throw new HttpError(404, "Peer user not found.");
  const me = await repo.findActiveOrgUser(pool, organizationId, actor.id);
  if (!me) throw new HttpError(403, "You are not an active member of this organization.");

  const existing = await repo.findDirectChat(pool, organizationId, actor.id, peerOrganizationUserId);
  if (existing) return { chatId: existing.id };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { chatId } = await repo.insertDirectChatTransaction(client, organizationId, actor.id, peerOrganizationUserId);
    await client.query("COMMIT");
    const nsp = getInternalChatNsp();
    nsp?.to(`user:${actor.id}`).emit("group_created", { chatId, type: "direct" });
    nsp?.to(`user:${peerOrganizationUserId}`).emit("group_created", { chatId, type: "direct" });
    return { chatId };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function createGroupChatService(
  organizationId: string,
  actor: AuthPayload,
  name: string | undefined,
  memberOrganizationUserIds: string[],
  imageFileId: string | undefined,
): Promise<{ chatId: string }> {
  const me = await repo.findActiveOrgUser(pool, organizationId, actor.id);
  if (!me) throw new HttpError(403, "You are not an active member of this organization.");

  let imagePath: string | null = null;
  if (imageFileId) {
    const f = await repo.findChatFile(pool, organizationId, imageFileId);
    if (!f) throw new HttpError(404, "Image file not found.");
    imagePath = f.blob_path;
  }

  for (const uid of memberOrganizationUserIds) {
    const u = await repo.findActiveOrgUser(pool, organizationId, uid);
    if (!u) throw new HttpError(400, `Invalid member id: ${uid}`);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { chatId } = await repo.insertGroupChatTransaction(
      client,
      organizationId,
      actor.id,
      name ?? null,
      imagePath,
      memberOrganizationUserIds,
    );
    await client.query("COMMIT");

    const members = await repo.listMembersForChat(pool, chatId);
    const nsp = getInternalChatNsp();
    for (const m of members) {
      nsp?.to(`user:${m.id}`).emit("group_created", { chatId, type: "group" });
    }
    return { chatId };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

function canManageGroup(membership: repo.ChatMemberRow | null, auth: AuthPayload): boolean {
  if (!membership) return false;
  if (auth.role === 1) return true;
  return membership.is_chat_admin;
}

export async function updateGroupChatService(
  organizationId: string,
  chatId: string,
  auth: AuthPayload,
  patch: {
    name?: string;
    imageFileId?: string | null;
    addMemberOrganizationUserIds?: string[];
    removeMemberOrganizationUserIds?: string[];
    promoteOrganizationUserIds?: string[];
  },
): Promise<void> {
  const chat = await repo.findChatById(pool, organizationId, chatId);
  if (!chat || chat.type !== "group") throw new HttpError(404, "Group chat not found.");
  const mem = await repo.findChatMemberRow(pool, chatId, auth.id);
  if (!mem) throw new HttpError(403, "Not a member of this chat.");
  if (!canManageGroup(mem, auth)) throw new HttpError(403, "Only chat admins or org admins can update this group.");

  if (typeof patch.name === "string") {
    await repo.updateGroupChat(pool, chatId, patch.name, undefined);
  }
  if (typeof patch.imageFileId !== "undefined") {
    let path: string | null = null;
    if (patch.imageFileId) {
      const f = await repo.findChatFile(pool, organizationId, patch.imageFileId);
      if (!f) throw new HttpError(404, "Image file not found.");
      path = f.blob_path;
    }
    await repo.updateGroupChat(pool, chatId, undefined, path ?? null);
  }
  if (patch.addMemberOrganizationUserIds?.length) {
    for (const uid of patch.addMemberOrganizationUserIds) {
      const u = await repo.findActiveOrgUser(pool, organizationId, uid);
      if (!u) throw new HttpError(400, `Invalid member: ${uid}`);
      await repo.insertMember(pool, chatId, uid, false);
      await repo.insertNotification(pool, {
        organization_id: organizationId,
        recipient_organization_user_id: uid,
        notification_type: "group_added",
        title: "Added to group",
        body: "You were added to a group chat.",
        reference_chat_id: chatId,
        reference_message_id: null,
      });
      const nsp = getInternalChatNsp();
      nsp?.to(`user:${uid}`).emit("notification", { type: "group_added", chatId });
    }
  }
  if (patch.removeMemberOrganizationUserIds?.length) {
    const roster = await repo.listMembersForChat(pool, chatId);
    if (roster.length - patch.removeMemberOrganizationUserIds.length < 2) {
      throw new HttpError(400, "A group chat must keep at least two members.");
    }
    for (const uid of patch.removeMemberOrganizationUserIds) {
      await repo.removeMember(pool, chatId, uid);
    }
  }
  if (patch.promoteOrganizationUserIds?.length) {
    for (const uid of patch.promoteOrganizationUserIds) {
      await repo.promoteMember(pool, chatId, uid, true);
    }
  }

  await repo.bumpChatTimestamp(pool, chatId);
  const members = await repo.listMembersForChat(pool, chatId);
  const nsp = getInternalChatNsp();
  for (const m of members) {
    nsp?.to(`user:${m.id}`).emit("group_updated", { chatId });
  }
}

export async function listMessagesService(
  organizationId: string,
  chatId: string,
  viewerId: string,
  beforeIso: string | undefined,
  limit: number,
): Promise<ChatMessageDto[]> {
  const chat = await repo.findChatById(pool, organizationId, chatId);
  if (!chat) throw new HttpError(404, "Chat not found.");
  const member = await repo.findChatMemberRow(pool, chatId, viewerId);
  if (!member) throw new HttpError(403, "Not a member of this chat.");
  const before = beforeIso ? new Date(beforeIso) : undefined;
  const rows = await repo.listMessagesForChat(pool, chatId, retentionSinceDate(), before, limit);
  const out: ChatMessageDto[] = [];
  for (const row of rows) {
    let f: repo.ChatFileRow | null = null;
    if (row.file_id) {
      f = await repo.findChatFile(pool, organizationId, row.file_id);
    }
    out.push(toMessageDto(row, f));
  }
  return out;
}

async function attachFileMeta(
  organizationId: string,
  row: repo.ChatMessageRow,
): Promise<ChatMessageDto> {
  let f: repo.ChatFileRow | null = null;
  if (row.file_id) f = await repo.findChatFile(pool, organizationId, row.file_id);
  return toMessageDto(row, f);
}

export async function insertMessageCore(
  organizationId: string,
  senderId: string,
  input: {
    chatId: string;
    messageType: "text" | "file" | "image" | "system";
    bodyText?: string | null;
    fileId?: string | null;
    replyMessageId?: string | null;
    clientMessageId?: string | null;
    mentionedOrganizationUserIds?: string[];
  },
): Promise<{ dto: ChatMessageDto; recipientUserIds: string[] }> {
  const chat = await repo.findChatById(pool, organizationId, input.chatId);
  if (!chat) throw new HttpError(404, "Chat not found.");
  const member = await repo.findChatMemberRow(pool, input.chatId, senderId);
  if (!member) throw new HttpError(403, "Not a member of this chat.");
  if (member.muted && input.messageType !== "system") {
    throw new HttpError(403, "You are muted in this chat.");
  }

  if (input.clientMessageId) {
    const dup = await pool.query<repo.ChatMessageRow>(
      `SELECT * FROM internal_chat_messages WHERE chat_id = $1 AND client_message_id = $2 LIMIT 1`,
      [input.chatId, input.clientMessageId],
    );
    if (dup.rows[0]) {
      const dto = await attachFileMeta(organizationId, dup.rows[0]);
      return { dto, recipientUserIds: [] };
    }
  }

  if (input.replyMessageId) {
    const rm = await repo.findMessageInChat(pool, input.chatId, input.replyMessageId);
    if (!rm) throw new HttpError(400, "Reply target not found.");
  }

  let fileId: string | null = input.fileId ?? null;
  if (fileId) {
    const f = await repo.findChatFile(pool, organizationId, fileId);
    if (!f || f.uploaded_by_organization_user_id !== senderId) {
      throw new HttpError(400, "Invalid file attachment.");
    }
    if (input.messageType === "image" && !f.mime_type.startsWith("image/")) {
      throw new HttpError(400, "Image messages require an image file.");
    }
  }

  const body = sanitizeChatPlainText(input.bodyText ?? undefined);
  if (input.messageType === "text" && !body) {
    throw new HttpError(400, "Text messages require body text.");
  }
  if ((input.messageType === "file" || input.messageType === "image") && !fileId) {
    throw new HttpError(400, "This message type requires a file.");
  }

  const metadata: Record<string, unknown> = {};
  if (input.mentionedOrganizationUserIds?.length) {
    metadata.mentionedOrganizationUserIds = input.mentionedOrganizationUserIds;
  }

  const row = await repo.insertMessage(pool, {
    chatId: input.chatId,
    senderOrganizationUserId: senderId,
    messageType: input.messageType,
    bodyText: body.length > 0 ? body : null,
    fileId,
    replyMessageId: input.replyMessageId ?? null,
    clientMessageId: input.clientMessageId ?? null,
    metadata,
  });
  await repo.bumpChatTimestamp(pool, input.chatId);
  await repo.insertDeliveriesForRecipients(pool, row.id, input.chatId, senderId);

  const dto = await attachFileMeta(organizationId, row);
  const members = await repo.listMembersForChat(pool, input.chatId);
  const recipientUserIds = members.filter((m) => m.id !== senderId).map((m) => m.id);

  for (const uid of recipientUserIds) {
    const mrow = await repo.findChatMemberRow(pool, input.chatId, uid);
    if (mrow?.muted) continue;
    await repo.insertNotification(pool, {
      organization_id: organizationId,
      recipient_organization_user_id: uid,
      notification_type: input.fileId ? "file_shared" : "new_message",
      title: "New message",
      body: body.slice(0, 200) || "Attachment",
      reference_chat_id: input.chatId,
      reference_message_id: row.id,
    });
    const nsp = getInternalChatNsp();
    nsp?.to(`user:${uid}`).emit("notification", {
      type: input.fileId ? "file_shared" : "new_message",
      chatId: input.chatId,
      messageId: row.id,
    });
  }

  if (input.mentionedOrganizationUserIds?.length) {
    for (const uid of input.mentionedOrganizationUserIds) {
      if (uid === senderId) continue;
      const m = await repo.findChatMemberRow(pool, input.chatId, uid);
      if (!m) continue;
      await repo.insertNotification(pool, {
        organization_id: organizationId,
        recipient_organization_user_id: uid,
        notification_type: "mention",
        title: "You were mentioned",
        body: body.slice(0, 200),
        reference_chat_id: input.chatId,
        reference_message_id: row.id,
      });
      getInternalChatNsp()?.to(`user:${uid}`).emit("notification", { type: "mention", chatId: input.chatId, messageId: row.id });
    }
  }

  broadcastChatMessage(input.chatId, dto);
  if (recipientUserIds.length > 0) {
    broadcastDelivered(input.chatId, row.id, recipientUserIds);
  }

  return { dto, recipientUserIds };
}

export function broadcastChatMessage(chatId: string, payload: ChatMessageDto): void {
  getInternalChatNsp()?.to(`chat:${chatId}`).emit("receive_message", { chatId, message: payload });
}

export function broadcastTyping(chatId: string, userId: string, typing: boolean): void {
  getInternalChatNsp()
    ?.to(`chat:${chatId}`)
    .emit(typing ? "typing" : "stop_typing", { chatId, userId });
}

export function broadcastRead(chatId: string, readerId: string, messageId: string): void {
  getInternalChatNsp()?.to(`chat:${chatId}`).emit("message_read", { chatId, readerId, messageId, readAt: new Date().toISOString() });
}

export function broadcastDelivered(chatId: string, messageId: string, userIds: string[]): void {
  getInternalChatNsp()?.to(`chat:${chatId}`).emit("message_delivered", { chatId, messageId, recipientIds: userIds });
}

export async function softDeleteMyMessageService(
  organizationId: string,
  auth: AuthPayload,
  messageId: string,
): Promise<void> {
  const r = await pool.query<{ chat_id: string; sender_organization_user_id: string }>(
    `SELECT chat_id, sender_organization_user_id FROM internal_chat_messages WHERE id = $1`,
    [messageId],
  );
  const hit = r.rows[0];
  if (!hit) throw new HttpError(404, "Message not found.");
  const chat = await repo.findChatById(pool, organizationId, hit.chat_id);
  if (!chat) throw new HttpError(404, "Chat not found.");
  const member = await repo.findChatMemberRow(pool, hit.chat_id, auth.id);
  if (!member) throw new HttpError(403, "Forbidden.");
  if (hit.sender_organization_user_id !== auth.id && !(auth.role === 1 || member.is_chat_admin)) {
    throw new HttpError(403, "Cannot delete this message.");
  }
  await repo.softDeleteMessage(pool, messageId, hit.chat_id);
}

export async function markReadService(
  organizationId: string,
  viewerId: string,
  chatId: string,
  readUpToMessageId: string,
): Promise<void> {
  const chat = await repo.findChatById(pool, organizationId, chatId);
  if (!chat) throw new HttpError(404, "Chat not found.");
  const member = await repo.findChatMemberRow(pool, chatId, viewerId);
  if (!member) throw new HttpError(403, "Not a member of this chat.");
  const msg = await repo.findMessageInChat(pool, chatId, readUpToMessageId);
  if (!msg) throw new HttpError(400, "Message not found in chat.");
  const ok = await repo.advanceMemberReadCursor(pool, chatId, viewerId, readUpToMessageId);
  if (!ok) return;
  await repo.batchInsertReadsUpTo(pool, chatId, viewerId, msg.created_at);
  await repo.insertReadReceipt(pool, readUpToMessageId, viewerId);
  broadcastRead(chatId, viewerId, readUpToMessageId);
}

export function safeStoredFileName(original: string): string {
  const t = original.trim().slice(0, 200);
  const base = t.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return base.length > 0 ? base : "file";
}

export async function createChatUploadTokenService(
  organizationId: string,
  uploaderId: string,
  originalName: string,
  mimeType: string,
  byteSize: number,
): Promise<{ uploadUrl: string; blobPath: string; storedName: string; expiresAt: string }> {
  assertAllowedChatMime(mimeType);
  const maxBytes = env.CHAT_UPLOAD_MAX_MB * 1024 * 1024;
  if (byteSize > maxBytes) {
    throw new HttpError(400, `File exceeds maximum size of ${env.CHAT_UPLOAD_MAX_MB} MB.`);
  }
  if (!isAzureConfigured()) throw new HttpError(500, "Azure Blob Storage is not configured.");
  const u = await repo.findActiveOrgUser(pool, organizationId, uploaderId);
  if (!u) throw new HttpError(403, "Forbidden.");

  const storedName = `${randomUUID()}-${safeStoredFileName(originalName)}`;
  const blobPath = internalChatBlobPath(organizationId, storedName);
  const { sasUrl, expiresAt } = await getBlobUploadSasUrl(env.AZURE_BLOB_CONTAINER, blobPath, {
    expiresInMinutes: env.CHAT_SAS_UPLOAD_TTL_MINUTES,
  });
  return { uploadUrl: sasUrl, blobPath, storedName, expiresAt };
}

export async function completeChatUploadService(
  organizationId: string,
  uploaderId: string,
  body: {
    storedName: string;
    blobPath: string;
    originalName: string;
    mimeType: string;
    byteSize: number;
  },
): Promise<{ fileId: string }> {
  assertAllowedChatMime(body.mimeType);
  const expected = internalChatBlobPath(organizationId, body.storedName);
  if (body.blobPath !== expected) {
    throw new HttpError(400, "Blob path mismatch.");
  }
  if (!isAzureConfigured()) throw new HttpError(500, "Azure Blob Storage is not configured.");

  const props = await getBlobContentProperties(env.AZURE_BLOB_CONTAINER, body.blobPath);
  if (!props?.contentLength) throw new HttpError(400, "Upload not found or empty.");
  if (Number(props.contentLength) !== body.byteSize) {
    throw new HttpError(400, "Reported file size does not match uploaded blob.");
  }

  const row = await repo.insertChatFile(pool, {
    organization_id: organizationId,
    uploaded_by_organization_user_id: uploaderId,
    blob_container: env.AZURE_BLOB_CONTAINER,
    blob_path: body.blobPath,
    stored_name: body.storedName,
    original_name: body.originalName,
    byte_size: String(body.byteSize),
    mime_type: body.mimeType,
    virus_scan_status: "pending",
  });

  return { fileId: row.id };
}

/** Browser-safe upload: PUT goes to Azure with CORS pitfalls; POST here streams to Blob via backend. */
export async function uploadChatFileViaServerService(
  organizationId: string,
  uploaderId: string,
  file: { buffer: Buffer; size: number; mimetype?: string; originalname?: string },
): Promise<{ fileId: string }> {
  const mimeRaw = file.mimetype?.trim() ?? "";
  let mimeType = mimeRaw.length > 0 ? mimeRaw : "application/octet-stream";
  if (mimeType === "application/octet-stream") {
    const g = mimeTypeFromBasename(typeof file.originalname === "string" ? file.originalname : "");
    if (g) mimeType = g;
  }
  assertAllowedChatMime(mimeType);

  const maxBytes = env.CHAT_UPLOAD_MAX_MB * 1024 * 1024;
  if (file.size <= 0) throw new HttpError(400, "Empty upload.");
  if (file.size > maxBytes) {
    throw new HttpError(400, `File exceeds maximum size of ${env.CHAT_UPLOAD_MAX_MB} MB.`);
  }
  if (!isAzureConfigured()) throw new HttpError(500, "Azure Blob Storage is not configured.");

  const u = await repo.findActiveOrgUser(pool, organizationId, uploaderId);
  if (!u) throw new HttpError(403, "Forbidden.");

  const originalName = typeof file.originalname === "string" && file.originalname.trim().length ? file.originalname : "attachment";
  const storedName = `${randomUUID()}-${safeStoredFileName(originalName)}`;
  const blobPath = internalChatBlobPath(organizationId, storedName);

  await uploadBuffer(env.AZURE_BLOB_CONTAINER, blobPath, file.buffer, mimeType);

  const row = await repo.insertChatFile(pool, {
    organization_id: organizationId,
    uploaded_by_organization_user_id: uploaderId,
    blob_container: env.AZURE_BLOB_CONTAINER,
    blob_path: blobPath,
    stored_name: storedName,
    original_name: originalName,
    byte_size: String(file.size),
    mime_type: mimeType,
    virus_scan_status: "pending",
  });

  return { fileId: row.id };
}

export async function downloadChatFileBufferService(
  organizationId: string,
  requesterId: string,
  fileId: string,
): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
  const f = await repo.findChatFile(pool, organizationId, fileId);
  if (!f) throw new HttpError(404, "File not found.");
  const me = await repo.findActiveOrgUser(pool, organizationId, requesterId);
  if (!me) throw new HttpError(403, "Forbidden.");

  const msg = await pool.query<{ chat_id: string }>(
    `SELECT chat_id FROM internal_chat_messages WHERE file_id = $1 LIMIT 1`,
    [fileId],
  );
  if (msg.rows[0]?.chat_id) {
    const mem = await repo.findChatMemberRow(pool, msg.rows[0].chat_id, requesterId);
    if (!mem) throw new HttpError(403, "Forbidden.");
  } else if (f.uploaded_by_organization_user_id !== requesterId && me.role !== 1) {
    throw new HttpError(403, "Forbidden.");
  }

  const buffer = await downloadBlobBuffer(f.blob_container, f.blob_path);
  return { buffer, filename: f.original_name, mimeType: f.mime_type };
}

export async function listNotificationsService(organizationUserId: string) {
  return repo.listNotifications(pool, organizationUserId, 100);
}

export async function markNotificationsReadService(organizationUserId: string, ids: string[]) {
  await repo.markNotificationsRead(pool, organizationUserId, ids);
}

export async function searchUsersInternalChat(organizationId: string, q: string) {
  if (!q.trim()) return [];
  return repo.searchOrgUsers(pool, organizationId, q, 30);
}

export async function getUnreadTotalService(organizationId: string, userId: string): Promise<number> {
  return repo.countUnreadTotalForUser(pool, organizationId, userId, retentionSinceDate());
}
