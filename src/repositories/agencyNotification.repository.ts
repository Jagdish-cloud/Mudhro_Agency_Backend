import type { Pool, PoolClient } from "pg";

import type { AgencyNotificationRow } from "../types/agencyInvoice.js";

type Executor = Pool | PoolClient;

const NOTIFICATION_COLUMNS = `
  id, organization_id, user_id, title, message, severity, related_entity_type,
  related_entity_id, is_read, created_at
`;

export type InsertNotificationParams = {
  organizationId: string;
  userId: string | null;
  title: string;
  message: string;
  severity?: "info" | "warning" | "critical";
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
};

export async function insertNotification(
  exec: Executor,
  params: InsertNotificationParams,
): Promise<AgencyNotificationRow> {
  const result = await exec.query<AgencyNotificationRow>(
    `
      INSERT INTO agency_notifications
        (organization_id, user_id, title, message, severity,
         related_entity_type, related_entity_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING ${NOTIFICATION_COLUMNS};
    `,
    [
      params.organizationId,
      params.userId,
      params.title,
      params.message,
      params.severity ?? "info",
      params.relatedEntityType ?? null,
      params.relatedEntityId ?? null,
    ],
  );
  return result.rows[0];
}

export async function listNotifications(
  exec: Executor,
  organizationId: string,
  options: { limit?: number } = {},
): Promise<AgencyNotificationRow[]> {
  const limit = options.limit ?? 50;
  const result = await exec.query<AgencyNotificationRow>(
    `
      SELECT ${NOTIFICATION_COLUMNS}
      FROM agency_notifications
      WHERE organization_id = $1
      ORDER BY created_at DESC
      LIMIT $2;
    `,
    [organizationId, limit],
  );
  return result.rows;
}

export async function markNotificationRead(
  exec: Executor,
  organizationId: string,
  id: string,
): Promise<boolean> {
  const result = await exec.query(
    `
      UPDATE agency_notifications
      SET is_read = TRUE
      WHERE id = $1 AND organization_id = $2;
    `,
    [id, organizationId],
  );
  return (result.rowCount ?? 0) > 0;
}
