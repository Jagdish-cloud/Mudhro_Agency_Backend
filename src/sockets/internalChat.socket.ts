import type { Server as HttpServer } from "node:http";

import jwt from "jsonwebtoken";
import { Server } from "socket.io";

import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import * as repo from "../repositories/internalChat.repository.js";
import {
  broadcastTyping,
  insertMessageCore,
  markReadService,
} from "../services/internalChat.service.js";
import { HttpError } from "../utils/httpError.js";
import { registerInternalChatNamespace } from "./internalChatSocket.registry.js";

type JwtDecoded = {
  sub?: string;
  organizationId?: string;
  email?: string;
  role?: unknown;
};

function coerceRole(value: unknown): number | null {
  if (value === 1 || value === 2) return value;
  if (value === "1") return 1;
  if (value === "2") return 2;
  return null;
}

/** Throttle duplicate typing bursts per socket. */
function parseCorsOrigin(): string | string[] | boolean {
  if (!env.SOCKET_CORS_ORIGIN?.trim()) return true;
  if (env.SOCKET_CORS_ORIGIN.includes(",")) {
    return env.SOCKET_CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return env.SOCKET_CORS_ORIGIN.trim();
}

export function attachInternalChatSockets(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: parseCorsOrigin(),
      methods: ["GET", "POST"],
    },
    path: "/socket.io/",
  });

  const nsp = io.of("/internal-chat");
  registerInternalChatNamespace(nsp);

  nsp.use((socket, next) => {
    try {
      const auth = socket.handshake.auth as { token?: string } | undefined;
      const header = typeof socket.handshake.headers.authorization === "string" ? socket.handshake.headers.authorization : "";
      const [, bearer] = header.split(" ");
      const rawToken = auth?.token ?? bearer;
      if (!rawToken) return next(new Error("Authentication required."));
      const decoded = jwt.verify(rawToken, env.JWT_SECRET) as JwtDecoded;
      const role = coerceRole(decoded.role);
      if (!decoded.sub || !decoded.organizationId || !decoded.email || role === null) {
        return next(new Error("Invalid token."));
      }
      socket.data.organizationId = decoded.organizationId as string;
      socket.data.organizationUserId = decoded.sub as string;
      socket.data.organizationUserRole = role;
      return next();
    } catch {
      return next(new Error("Authentication required."));
    }
  });

  const typingThrottle = new Map<string, number>();
  function canEmitTyping(chatId: string, uid: string): boolean {
    const key = `${chatId}:${uid}`;
    const now = Date.now();
    const last = typingThrottle.get(key) ?? 0;
    if (now - last < 1200) return false;
    typingThrottle.set(key, now);
    return true;
  }

  nsp.on("connection", (socket) => {
    const orgId = socket.data.organizationId as string;
    const userId = socket.data.organizationUserId as string;

    void repo.openSocketSession(pool, socket.id, userId, orgId).catch(() => undefined);
    void socket.join(`user:${userId}`);

    socket.on("join_chat", (payload: { chatId?: string }, ack?: (e: unknown) => void) => {
      void (async () => {
        try {
          const chatId = payload?.chatId;
          if (!chatId) throw new HttpError(400, "chatId is required.");
          const row = await repo.findChatMemberRow(pool, chatId, userId);
          if (!row) throw new HttpError(403, "Not allowed to join this chat.");
          await socket.join(`chat:${chatId}`);
          ack?.({ ok: true });
        } catch (e) {
          const msg = e instanceof HttpError ? e.message : "join_chat failed.";
          ack?.({ error: msg });
        }
      })();
    });

    socket.on("leave_chat", (payload: { chatId?: string }) => {
      const chatId = payload?.chatId;
      if (chatId) void socket.leave(`chat:${chatId}`);
    });

    socket.on(
      "send_message",
      (payload: {
        chatId?: string;
        messageType?: string;
        bodyText?: string;
        fileId?: string;
        replyMessageId?: string;
        clientMessageId?: string;
        mentionedOrganizationUserIds?: string[];
      }) => {
        void (async () => {
          try {
            const chatId = payload.chatId;
            const messageType = payload.messageType as "text" | "file" | "image" | "system" | undefined;
            if (!chatId || !messageType) {
              socket.emit("error_event", { message: "Invalid send_message payload." });
              return;
            }
            await insertMessageCore(orgId, userId, {
              chatId,
              messageType,
              bodyText: payload.bodyText,
              fileId: payload.fileId,
              replyMessageId: payload.replyMessageId,
              clientMessageId: payload.clientMessageId,
              mentionedOrganizationUserIds: payload.mentionedOrganizationUserIds,
            });
          } catch (e) {
            socket.emit("error_event", {
              message: e instanceof HttpError ? e.message : "Failed to send message.",
            });
          }
        })();
      },
    );

    socket.on("typing", (payload: { chatId?: string }) => {
      const chatId = payload?.chatId;
      if (!chatId) return;
      if (!canEmitTyping(chatId, userId)) return;
      broadcastTyping(chatId, userId, true);
    });

    socket.on("stop_typing", (payload: { chatId?: string }) => {
      const chatId = payload?.chatId;
      if (!chatId) return;
      broadcastTyping(chatId, userId, false);
    });

    socket.on("message_read", (payload: { chatId?: string; messageId?: string }) => {
      void (async () => {
        try {
          if (!payload.chatId || !payload.messageId) return;
          await markReadService(orgId, userId, payload.chatId, payload.messageId);
        } catch (e) {
          socket.emit("error_event", {
            message: e instanceof HttpError ? e.message : "message_read failed.",
          });
        }
      })();
    });

    socket.on("heartbeat", () => {
      void pool.query(`UPDATE organization_admins SET last_seen = NOW() WHERE id = $1`, [userId]);
    });

    socket.on("disconnect", () => {
      void repo.closeSocketSession(pool, socket.id).catch(() => undefined);
    });
  });

  return io;
}
