import type { Pool, PoolClient } from "pg";

type Executor = Pool | PoolClient;

export type OrgUserRow = {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  role: number;
  profile_picture_blob_path: string | null;
  is_online: boolean;
  last_seen: Date | null;
};

export type ChatRow = {
  id: string;
  organization_id: string;
  type: string;
  dm_user_low: string | null;
  dm_user_high: string | null;
  group_name: string | null;
  group_image_blob_path: string | null;
  created_by_organization_user_id: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type ChatMemberRow = {
  id: string;
  chat_id: string;
  organization_user_id: string;
  joined_at: Date;
  is_chat_admin: boolean;
  muted: boolean;
  last_read_message_id: string | null;
};

export type ChatMessageRow = {
  id: string;
  chat_id: string;
  sender_organization_user_id: string;
  message_type: string;
  body_text: string | null;
  file_id: string | null;
  reply_message_id: string | null;
  edited: boolean;
  deleted: boolean;
  client_message_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export type ChatFileRow = {
  id: string;
  organization_id: string;
  uploaded_by_organization_user_id: string;
  blob_container: string;
  blob_path: string;
  stored_name: string;
  original_name: string;
  byte_size: string;
  mime_type: string;
  virus_scan_status: string;
  uploaded_at: Date;
};

export async function findActiveOrgUser(
  exec: Executor,
  organizationId: string,
  userId: string,
): Promise<OrgUserRow | null> {
  const r = await exec.query<OrgUserRow>(
    `
      SELECT id, organization_id, name, email, role, profile_picture_blob_path,
        is_online, last_seen
      FROM organization_admins
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL AND status = 'active'
      LIMIT 1;
    `,
    [userId, organizationId],
  );
  return r.rows[0] ?? null;
}

export async function searchOrgUsers(
  exec: Executor,
  organizationId: string,
  q: string,
  limit: number,
): Promise<OrgUserRow[]> {
  const term = `%${q.trim().slice(0, 100)}%`;
  const r = await exec.query<OrgUserRow>(
    `
      SELECT id, organization_id, name, email, role, profile_picture_blob_path,
        is_online, last_seen
      FROM organization_admins
      WHERE organization_id = $1 AND deleted_at IS NULL AND status = 'active'
        AND (
          email ILIKE $2 OR name ILIKE $2
        )
      ORDER BY name ASC
      LIMIT $3;
    `,
    [organizationId, term, limit],
  );
  return r.rows;
}

export async function findDirectChat(
  exec: Executor,
  organizationId: string,
  userA: string,
  userB: string,
): Promise<{ id: string } | null> {
  const r = await exec.query<{ id: string }>(
    `
      SELECT id FROM internal_chats
      WHERE organization_id = $1 AND type = 'direct' AND deleted_at IS NULL
        AND dm_user_low = LEAST($2::uuid, $3::uuid)
        AND dm_user_high = GREATEST($2::uuid, $3::uuid)
      LIMIT 1;
    `,
    [organizationId, userA, userB],
  );
  return r.rows[0] ?? null;
}

export async function insertDirectChatTransaction(
  client: PoolClient,
  organizationId: string,
  actorId: string,
  peerId: string,
): Promise<{ chatId: string }> {
  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO internal_chats (
        organization_id, type,
        dm_user_low, dm_user_high,
        created_by_organization_user_id
      )
      VALUES (
        $1, 'direct',
        LEAST($2::uuid, $3::uuid),
        GREATEST($2::uuid, $3::uuid),
        $4::uuid
      )
      RETURNING id;
    `,
    [organizationId, actorId, peerId, actorId],
  );
  const chatId = inserted.rows[0].id;
  await client.query(
    `INSERT INTO internal_chat_members (chat_id, organization_user_id, is_chat_admin)
     VALUES ($1::uuid, $2::uuid, FALSE), ($1::uuid, $3::uuid, FALSE);`,
    [chatId, actorId, peerId],
  );

  await client.query(
    `INSERT INTO internal_chat_audit_events (
      organization_id, actor_organization_user_id, action, entity_type, entity_id
    ) VALUES ($1,$2,'chat_created','chat',$3);`,
    [organizationId, actorId, chatId],
  );

  return { chatId };
}

export async function insertGroupChatTransaction(
  client: PoolClient,
  organizationId: string,
  actorId: string,
  name: string | null,
  imagePath: string | null,
  memberIds: string[],
): Promise<{ chatId: string }> {
  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO internal_chats (
        organization_id, type, group_name, group_image_blob_path,
        created_by_organization_user_id
      )
      VALUES ($1, 'group', $2, $3, $4)
      RETURNING id;
    `,
    [organizationId, name, imagePath, actorId],
  );
  const chatId = inserted.rows[0].id;

  const uniqueMembers = [...new Set([actorId, ...memberIds])];
  for (const uid of uniqueMembers) {
    await client.query(
      `INSERT INTO internal_chat_members (chat_id, organization_user_id, is_chat_admin)
       VALUES ($1::uuid, $2::uuid, $3::boolean);`,
      [chatId, uid, uid === actorId],
    );
  }

  await client.query(
    `INSERT INTO internal_chat_audit_events (
      organization_id, actor_organization_user_id, action, entity_type, entity_id, payload
    ) VALUES ($1,$2,'group_created','chat',$3,$4::jsonb);`,
    [organizationId, actorId, chatId, JSON.stringify({ memberIds: uniqueMembers })],
  );

  return { chatId };
}

export async function findChatById(exec: Executor, organizationId: string, chatId: string): Promise<ChatRow | null> {
  const r = await exec.query<ChatRow>(
    `SELECT * FROM internal_chats WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [chatId, organizationId],
  );
  return r.rows[0] ?? null;
}

export async function findChatMemberRow(
  exec: Executor,
  chatId: string,
  organizationUserId: string,
): Promise<ChatMemberRow | null> {
  const r = await exec.query<ChatMemberRow>(
    `
      SELECT * FROM internal_chat_members
      WHERE chat_id = $1 AND organization_user_id = $2
      LIMIT 1;
    `,
    [chatId, organizationUserId],
  );
  return r.rows[0] ?? null;
}

export async function listMembersForChat(
  exec: Executor,
  chatId: string,
): Promise<(OrgUserRow & { is_chat_admin: boolean; muted: boolean })[]> {
  const r = await exec.query<
    OrgUserRow & {
      is_chat_admin: boolean;
      muted: boolean;
    }
  >(
    `
      SELECT u.id, u.organization_id, u.name, u.email, u.role, u.profile_picture_blob_path,
        u.is_online, u.last_seen, m.is_chat_admin, m.muted
      FROM internal_chat_members m
      JOIN organization_admins u ON u.id = m.organization_user_id
      WHERE m.chat_id = $1 AND u.deleted_at IS NULL
      ORDER BY u.name ASC;
    `,
    [chatId],
  );
  return r.rows;
}

export async function listChatsForUser(
  exec: Executor,
  organizationId: string,
  viewerOrganizationUserId: string,
  searchRaw: string | undefined,
  retentionSince: Date,
  cursorUpdatedAt: Date | undefined,
  limit: number,
): Promise<
  Array<{
    chat_row: ChatRow;
    unread: number;
    last_body: string | null;
    last_message_at: Date | null;
  }>
> {
  let query = `
    SELECT c.*,
      COALESCE(uc.unread, 0)::int AS unread,
      lm.body_text AS last_body,
      lm.created_at AS last_message_at
    FROM internal_chats c
    INNER JOIN internal_chat_members mem ON mem.chat_id = c.id AND mem.organization_user_id = $2
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS unread
      FROM internal_chat_messages m
      WHERE m.chat_id = c.id AND m.deleted = false
        AND m.created_at >= $3
        AND m.sender_organization_user_id <> $2
        AND (
          mem.last_read_message_id IS NULL
          OR m.created_at > COALESCE(
            (SELECT lr.created_at FROM internal_chat_messages lr WHERE lr.id = mem.last_read_message_id),
            to_timestamp(0)
          )
        )
    ) uc ON true
    LEFT JOIN LATERAL (
      SELECT m.body_text, m.created_at
      FROM internal_chat_messages m
      WHERE m.chat_id = c.id AND m.deleted = false AND m.created_at >= $3
      ORDER BY m.created_at DESC
      LIMIT 1
    ) lm ON true
    WHERE c.organization_id = $1 AND c.deleted_at IS NULL
  `;
  const params: unknown[] = [organizationId, viewerOrganizationUserId, retentionSince];
  if (cursorUpdatedAt) {
    params.push(cursorUpdatedAt);
    query += ` AND c.updated_at < $${params.length}::timestamptz`;
  }
  if (searchRaw && searchRaw.trim().length > 0) {
    params.push(`%${searchRaw.trim().slice(0, 100)}%`);
    query += ` AND ((c.type = 'group' AND c.group_name ILIKE $${params.length}) OR c.type = 'direct')`;
  }
  params.push(limit + 1);
  query += ` ORDER BY c.updated_at DESC LIMIT $${params.length}`;

  const r = await exec.query<
    ChatRow & { unread: number; last_body: string | null; last_message_at: Date | null }
  >(query, params);

  return r.rows.map((row) => ({
    chat_row: {
      id: row.id,
      organization_id: row.organization_id,
      type: row.type,
      dm_user_low: row.dm_user_low,
      dm_user_high: row.dm_user_high,
      group_name: row.group_name,
      group_image_blob_path: row.group_image_blob_path,
      created_by_organization_user_id: row.created_by_organization_user_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
    },
    unread: row.unread,
    last_body: row.last_body,
    last_message_at: row.last_message_at,
  }));
}

export async function bumpChatTimestamp(exec: Executor, chatId: string): Promise<void> {
  await exec.query(`UPDATE internal_chats SET updated_at = NOW() WHERE id = $1;`, [chatId]);
}

export async function insertMessage(
  exec: Executor,
  params: {
    chatId: string;
    senderOrganizationUserId: string;
    messageType: string;
    bodyText: string | null;
    fileId: string | null;
    replyMessageId: string | null;
    clientMessageId: string | null;
    metadata: Record<string, unknown>;
  },
): Promise<ChatMessageRow> {
  const r = await exec.query<ChatMessageRow>(
    `
      INSERT INTO internal_chat_messages (
        chat_id, sender_organization_user_id, message_type,
        body_text, file_id, reply_message_id, client_message_id, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      RETURNING *;
    `,
    [
      params.chatId,
      params.senderOrganizationUserId,
      params.messageType,
      params.bodyText,
      params.fileId,
      params.replyMessageId,
      params.clientMessageId,
      JSON.stringify(params.metadata ?? {}),
    ],
  );
  return r.rows[0];
}

export async function listMessagesForChat(
  exec: Executor,
  chatId: string,
  retentionSince: Date,
  beforeIso: Date | undefined,
  limit: number,
): Promise<ChatMessageRow[]> {
  if (beforeIso) {
    const r = await exec.query<ChatMessageRow>(
      `
        SELECT m.*
        FROM internal_chat_messages m
        WHERE m.chat_id = $1 AND m.deleted = false
          AND m.created_at >= $2 AND m.created_at < $3::timestamptz
        ORDER BY m.created_at DESC
        LIMIT $4;
      `,
      [chatId, retentionSince, beforeIso, limit],
    );
    return r.rows.reverse();
  }
  const r = await exec.query<ChatMessageRow>(
    `
      SELECT m.*
      FROM internal_chat_messages m
      WHERE m.chat_id = $1 AND m.deleted = false AND m.created_at >= $2
      ORDER BY m.created_at DESC
      LIMIT $3;
    `,
    [chatId, retentionSince, limit],
  );
  return r.rows.reverse();
}

export async function findMessageInChat(
  exec: Executor,
  chatId: string,
  messageId: string,
): Promise<ChatMessageRow | null> {
  const r = await exec.query<ChatMessageRow>(
    `SELECT * FROM internal_chat_messages WHERE id = $1 AND chat_id = $2 AND deleted = false LIMIT 1`,
    [messageId, chatId],
  );
  return r.rows[0] ?? null;
}

export async function softDeleteMessage(exec: Executor, messageId: string, chatId: string): Promise<boolean> {
  const r = await exec.query(`UPDATE internal_chat_messages SET deleted = TRUE, body_text = NULL WHERE id = $1 AND chat_id = $2`, [
    messageId,
    chatId,
  ]);
  return Number(r.rowCount) > 0;
}

export async function advanceMemberReadCursor(
  exec: Executor,
  chatId: string,
  viewerOrganizationUserId: string,
  readUpToMessageId: string,
): Promise<boolean> {
  const r = await exec.query(
    `
      UPDATE internal_chat_members m SET last_read_message_id = msg.id
      FROM internal_chat_messages msg
      WHERE m.chat_id = $1 AND m.organization_user_id = $2
        AND msg.id = $3::uuid AND msg.chat_id = m.chat_id
        AND (
          m.last_read_message_id IS NULL
          OR msg.created_at > COALESCE((SELECT x.created_at FROM internal_chat_messages x WHERE x.id = m.last_read_message_id), to_timestamp(0))
        )
      RETURNING m.id;
    `,
    [chatId, viewerOrganizationUserId, readUpToMessageId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function insertReadReceipt(exec: Executor, messageId: string, readerUserId: string): Promise<void> {
  await exec.query(
    `
      INSERT INTO internal_chat_message_reads (message_id, organization_user_id)
      VALUES ($1, $2)
      ON CONFLICT (message_id, organization_user_id) DO NOTHING;
    `,
    [messageId, readerUserId],
  );
}

export async function batchInsertReadsUpTo(
  exec: Executor,
  chatId: string,
  readerUserId: string,
  ceilingCreatedAt: Date,
): Promise<void> {
  await exec.query(
    `
      INSERT INTO internal_chat_message_reads (message_id, organization_user_id)
      SELECT m.id, $2
      FROM internal_chat_messages m
      WHERE m.chat_id = $1 AND m.deleted = false AND m.created_at <= $3
        AND m.sender_organization_user_id <> $2
      ON CONFLICT (message_id, organization_user_id) DO NOTHING;
    `,
    [chatId, readerUserId, ceilingCreatedAt],
  );
}

export async function insertDeliveriesForRecipients(
  exec: Executor,
  messageId: string,
  chatId: string,
  senderOrganizationUserId: string,
): Promise<void> {
  await exec.query(
    `
      INSERT INTO internal_chat_message_delivered (message_id, organization_user_id)
      SELECT $1::uuid, m.organization_user_id
      FROM internal_chat_members m
      WHERE m.chat_id = $2 AND m.organization_user_id <> $3
      ON CONFLICT (message_id, organization_user_id) DO NOTHING;
    `,
    [messageId, chatId, senderOrganizationUserId],
  );
}

export async function insertChatFile(
  exec: Executor,
  row: Omit<ChatFileRow, "id" | "uploaded_at">,
): Promise<ChatFileRow> {
  const r = await exec.query<ChatFileRow>(
    `
      INSERT INTO internal_chat_files (
        organization_id, uploaded_by_organization_user_id,
        blob_container, blob_path, stored_name, original_name,
        byte_size, mime_type, virus_scan_status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *;
    `,
    [
      row.organization_id,
      row.uploaded_by_organization_user_id,
      row.blob_container,
      row.blob_path,
      row.stored_name,
      row.original_name,
      row.byte_size,
      row.mime_type,
      row.virus_scan_status,
    ],
  );
  return r.rows[0];
}

export async function findChatFile(exec: Executor, organizationId: string, fileId: string): Promise<ChatFileRow | null> {
  const r = await exec.query<ChatFileRow>(
    `SELECT * FROM internal_chat_files WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [fileId, organizationId],
  );
  return r.rows[0] ?? null;
}

export async function insertNotification(
  exec: Executor,
  row: {
    organization_id: string;
    recipient_organization_user_id: string;
    notification_type: string;
    title: string;
    body: string;
    reference_chat_id: string | null;
    reference_message_id: string | null;
  },
): Promise<void> {
  await exec.query(
    `
      INSERT INTO internal_chat_notifications (
        organization_id, recipient_organization_user_id, notification_type,
        title, body, reference_chat_id, reference_message_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7);
    `,
    [
      row.organization_id,
      row.recipient_organization_user_id,
      row.notification_type,
      row.title,
      row.body,
      row.reference_chat_id,
      row.reference_message_id,
    ],
  );
}

export async function listNotifications(
  exec: Executor,
  organizationUserId: string,
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  const r = await exec.query(
    `
      SELECT * FROM internal_chat_notifications
      WHERE recipient_organization_user_id = $1
      ORDER BY created_at DESC
      LIMIT $2;
    `,
    [organizationUserId, limit],
  );
  return r.rows as Array<Record<string, unknown>>;
}

export async function markNotificationsRead(exec: Executor, organizationUserId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await exec.query(
    `
      UPDATE internal_chat_notifications SET is_read = TRUE
      WHERE recipient_organization_user_id = $1 AND id = ANY($2::uuid[]);
    `,
    [organizationUserId, ids],
  );
}

export async function updateGroupChat(exec: Executor, chatId: string, name?: string | null, image?: string | null) {
  const fields: string[] = [];
  const params: unknown[] = [];
  if (typeof name === "string") {
    params.push(name);
    fields.push(`group_name = $${params.length}`);
  }
  if (typeof image !== "undefined") {
    params.push(image);
    fields.push(`group_image_blob_path = $${params.length}`);
  }
  if (fields.length === 0) return;
  params.push(chatId);
  await exec.query(`UPDATE internal_chats SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${params.length}`, params);
}

export async function insertMember(exec: Executor, chatId: string, userId: string, admin: boolean) {
  await exec.query(
    `INSERT INTO internal_chat_members (chat_id, organization_user_id, is_chat_admin) VALUES ($1,$2,$3)
     ON CONFLICT (chat_id, organization_user_id) DO NOTHING`,
    [chatId, userId, admin],
  );
}

export async function removeMember(exec: Executor, chatId: string, userId: string) {
  await exec.query(`DELETE FROM internal_chat_members WHERE chat_id = $1 AND organization_user_id = $2`, [chatId, userId]);
}

export async function promoteMember(exec: Executor, chatId: string, userId: string, promote: boolean) {
  await exec.query(`UPDATE internal_chat_members SET is_chat_admin = $3 WHERE chat_id = $1 AND organization_user_id = $2`, [
    chatId,
    userId,
    promote,
  ]);
}

export async function countUnreadTotalForUser(exec: Executor, organizationId: string, userId: string, retentionSince: Date) {
  const r = await exec.query<{ c: string }>(
    `
      SELECT COALESCE(SUM(sub.unread), 0)::text AS c
      FROM (
        SELECT COALESCE(uc.unread, 0)::int AS unread
        FROM internal_chats c
        INNER JOIN internal_chat_members mem ON mem.chat_id = c.id AND mem.organization_user_id = $2
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS unread
          FROM internal_chat_messages m
          WHERE m.chat_id = c.id AND m.deleted = false
            AND m.created_at >= $3
            AND m.sender_organization_user_id <> $2
            AND (
              mem.last_read_message_id IS NULL
              OR m.created_at > COALESCE(
                (SELECT lr.created_at FROM internal_chat_messages lr WHERE lr.id = mem.last_read_message_id),
                to_timestamp(0)
              )
            )
        ) uc ON true
        WHERE c.organization_id = $1 AND c.deleted_at IS NULL
      ) sub;
    `,
    [organizationId, userId, retentionSince],
  );
  return Number(r.rows[0]?.c ?? "0");
}

export async function openSocketSession(
  exec: Executor,
  socketId: string,
  organizationUserId: string,
  organizationId: string,
) {
  await exec.query(
    `INSERT INTO internal_chat_socket_sessions (socket_id, organization_user_id, organization_id)
     VALUES ($1,$2,$3)`,
    [socketId, organizationUserId, organizationId],
  );
  await exec.query(`UPDATE organization_admins SET is_online = TRUE, last_seen = NOW() WHERE id = $1`, [
    organizationUserId,
  ]);
}

export async function closeSocketSession(exec: Executor, socketId: string) {
  const r = await exec.query<{ organization_user_id: string }>(
    `UPDATE internal_chat_socket_sessions SET disconnected_at = NOW() WHERE socket_id = $1 AND disconnected_at IS NULL
     RETURNING organization_user_id`,
    [socketId],
  );
  const uid = r.rows[0]?.organization_user_id;
  if (!uid) return;
  const still = await exec.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM internal_chat_socket_sessions
     WHERE organization_user_id = $1 AND disconnected_at IS NULL`,
    [uid],
  );
  if (Number(still.rows[0]?.c ?? "0") === 0) {
    await exec.query(`UPDATE organization_admins SET is_online = FALSE, last_seen = NOW() WHERE id = $1`, [uid]);
  }
}

export async function deleteOldMessagesAndRelated(exec: Executor, cutoff: Date) {
  await exec.query(`DELETE FROM internal_chat_message_reads WHERE message_id IN (SELECT id FROM internal_chat_messages WHERE created_at < $1)`, [
    cutoff,
  ]);
  await exec.query(
    `DELETE FROM internal_chat_message_delivered WHERE message_id IN (SELECT id FROM internal_chat_messages WHERE created_at < $1)`,
    [cutoff],
  );
  await exec.query(
    `DELETE FROM internal_chat_notifications WHERE reference_message_id IN (SELECT id FROM internal_chat_messages WHERE created_at < $1)`,
    [cutoff],
  );
  await exec.query(`DELETE FROM internal_chat_messages WHERE created_at < $1`, [cutoff]);
}

export async function listOrphanChatFiles(exec: Executor, cutoff: Date): Promise<ChatFileRow[]> {
  const r = await exec.query<ChatFileRow>(
    `
      SELECT f.*
      FROM internal_chat_files f
      WHERE f.uploaded_at < $1
        AND NOT EXISTS (SELECT 1 FROM internal_chat_messages m WHERE m.file_id = f.id);
    `,
    [cutoff],
  );
  return r.rows;
}

export async function deleteChatFileRow(exec: Executor, fileId: string) {
  await exec.query(`DELETE FROM internal_chat_files WHERE id = $1`, [fileId]);
}

