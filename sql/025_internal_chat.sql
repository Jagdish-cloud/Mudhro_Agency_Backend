-- Internal org chat: direct + group messaging, attachments, realtime presence scaffolding.
-- Run after 024_agency_vendors.sql.

-- -----------------------------------------------------------------------------
-- Presence / profile on existing users (organization_admins)
-- -----------------------------------------------------------------------------
ALTER TABLE organization_admins
  ADD COLUMN IF NOT EXISTS profile_picture_blob_path TEXT NULL,
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS organization_admins_org_online_idx
  ON organization_admins (organization_id)
  WHERE is_online = TRUE AND deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- Chats (direct pairing columns only used when type = 'direct')
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS internal_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  dm_user_low UUID NULL REFERENCES organization_admins(id) ON DELETE CASCADE,
  dm_user_high UUID NULL REFERENCES organization_admins(id) ON DELETE CASCADE,
  group_name TEXT NULL,
  group_image_blob_path TEXT NULL,
  created_by_organization_user_id UUID NOT NULL REFERENCES organization_admins(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT internal_chats_type_chk CHECK (type IN ('direct', 'group')),
  CONSTRAINT internal_chats_dm_pair_chk CHECK (
    (type = 'direct' AND dm_user_low IS NOT NULL AND dm_user_high IS NOT NULL
      AND dm_user_low = LEAST(dm_user_low, dm_user_high) AND dm_user_high = GREATEST(dm_user_low, dm_user_high))
    OR (type = 'group' AND dm_user_low IS NULL AND dm_user_high IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS internal_chats_direct_pair_org_unique
  ON internal_chats (organization_id, dm_user_low, dm_user_high)
  WHERE type = 'direct' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS internal_chats_org_updated_idx
  ON internal_chats (organization_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- Standalone blobs (referenced by messages): created before messages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS internal_chat_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by_organization_user_id UUID NOT NULL REFERENCES organization_admins(id) ON DELETE CASCADE,
  blob_container TEXT NOT NULL,
  blob_path TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  virus_scan_status TEXT NOT NULL DEFAULT 'pending',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT internal_chat_files_size_positive_chk CHECK (byte_size > 0),
  CONSTRAINT internal_chat_files_virus_scan_chk CHECK (
    virus_scan_status IN ('pending', 'skipped', 'rejected')
  ),
  CONSTRAINT internal_chat_files_org_path_unique UNIQUE (organization_id, blob_path)
);

CREATE INDEX IF NOT EXISTS internal_chat_files_org_uploaded_idx
  ON internal_chat_files (organization_id, uploaded_at DESC);

-- -----------------------------------------------------------------------------
-- Members (cursor read without FK initially — added below)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS internal_chat_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES internal_chats(id) ON DELETE CASCADE,
  organization_user_id UUID NOT NULL REFERENCES organization_admins(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_chat_admin BOOLEAN NOT NULL DEFAULT FALSE,
  muted BOOLEAN NOT NULL DEFAULT FALSE,
  last_read_message_id UUID NULL,
  CONSTRAINT internal_chat_members_chat_user_unique UNIQUE (chat_id, organization_user_id)
);

CREATE INDEX IF NOT EXISTS internal_chat_members_chat_idx ON internal_chat_members (chat_id);
CREATE INDEX IF NOT EXISTS internal_chat_members_user_idx ON internal_chat_members (organization_user_id);

-- -----------------------------------------------------------------------------
-- Messages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS internal_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES internal_chats(id) ON DELETE CASCADE,
  sender_organization_user_id UUID NOT NULL REFERENCES organization_admins(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL,
  body_text TEXT NULL,
  file_id UUID NULL REFERENCES internal_chat_files(id) ON DELETE SET NULL,
  reply_message_id UUID NULL,
  edited BOOLEAN NOT NULL DEFAULT FALSE,
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  client_message_id TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT internal_chat_messages_type_chk CHECK (
    message_type IN ('text', 'file', 'image', 'system')
  )
);

ALTER TABLE internal_chat_messages
  ADD CONSTRAINT internal_chat_messages_reply_fk FOREIGN KEY (reply_message_id) REFERENCES internal_chat_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS internal_chat_messages_chat_created_desc_idx
  ON internal_chat_messages (chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS internal_chat_messages_sender_idx
  ON internal_chat_messages (sender_organization_user_id);

CREATE INDEX IF NOT EXISTS internal_chat_messages_client_id_idx
  ON internal_chat_messages (chat_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

-- Optional retention scan
CREATE INDEX IF NOT EXISTS internal_chat_messages_created_retention_idx
  ON internal_chat_messages (created_at);

ALTER TABLE internal_chat_members
  ADD CONSTRAINT internal_chat_members_last_read_fk FOREIGN KEY (last_read_message_id) REFERENCES internal_chat_messages(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- Read & delivery receipts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS internal_chat_message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES internal_chat_messages(id) ON DELETE CASCADE,
  organization_user_id UUID NOT NULL REFERENCES organization_admins(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT internal_chat_message_reads_unique UNIQUE (message_id, organization_user_id)
);

CREATE INDEX IF NOT EXISTS internal_chat_message_reads_user_idx ON internal_chat_message_reads (organization_user_id);
CREATE INDEX IF NOT EXISTS internal_chat_message_reads_message_idx ON internal_chat_message_reads (message_id);

CREATE TABLE IF NOT EXISTS internal_chat_message_delivered (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES internal_chat_messages(id) ON DELETE CASCADE,
  organization_user_id UUID NOT NULL REFERENCES organization_admins(id) ON DELETE CASCADE,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT internal_chat_message_delivered_unique UNIQUE (message_id, organization_user_id)
);

CREATE INDEX IF NOT EXISTS internal_chat_message_delivered_msg_idx ON internal_chat_message_delivered (message_id);

-- -----------------------------------------------------------------------------
-- In-app notifications (separate from agency_notifications)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS internal_chat_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recipient_organization_user_id UUID NOT NULL REFERENCES organization_admins(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  reference_chat_id UUID NULL REFERENCES internal_chats(id) ON DELETE SET NULL,
  reference_message_id UUID NULL REFERENCES internal_chat_messages(id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT internal_chat_notifications_type_chk CHECK (
    notification_type IN ('new_message', 'mention', 'group_added', 'file_shared')
  )
);

CREATE INDEX IF NOT EXISTS internal_chat_notifications_recipient_unread_idx
  ON internal_chat_notifications (recipient_organization_user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS internal_chat_notifications_org_idx ON internal_chat_notifications (organization_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- Socket sessions / presence refcount
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS internal_chat_socket_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  socket_id TEXT NOT NULL UNIQUE,
  organization_user_id UUID NOT NULL REFERENCES organization_admins(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS internal_chat_socket_sessions_user_idx
  ON internal_chat_socket_sessions (organization_user_id)
  WHERE disconnected_at IS NULL;

-- -----------------------------------------------------------------------------
-- Audit trail (lightweight)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS internal_chat_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_organization_user_id UUID NOT NULL REFERENCES organization_admins(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS internal_chat_audit_events_org_created_idx ON internal_chat_audit_events (organization_id, created_at DESC);

