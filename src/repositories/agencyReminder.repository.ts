import type { Pool, PoolClient } from "pg";

import type {
  AgencyReminderChannel,
  AgencyReminderRow,
  AgencyReminderStatus,
  AgencyReminderType,
} from "../types/agencyInvoice.js";

type Executor = Pool | PoolClient;

const REMINDER_COLUMNS = `
  id, invoice_id, organization_id, type, offset_days, scheduled_for, channel,
  status, sent_at, error, created_at, updated_at
`;

export type InsertReminderParams = {
  invoiceId: string;
  organizationId: string;
  type: AgencyReminderType;
  offsetDays: number;
  scheduledFor: Date;
  channel: AgencyReminderChannel;
  status?: AgencyReminderStatus;
};

export async function insertReminders(
  exec: Executor,
  items: InsertReminderParams[],
): Promise<AgencyReminderRow[]> {
  if (items.length === 0) return [];
  const values: string[] = [];
  const params: unknown[] = [];
  items.forEach((it) => {
    const b = params.length;
    values.push(
      `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7})`,
    );
    params.push(
      it.invoiceId,
      it.organizationId,
      it.type,
      it.offsetDays,
      it.scheduledFor,
      it.channel,
      it.status ?? "scheduled",
    );
  });

  const result = await exec.query<AgencyReminderRow>(
    `
      INSERT INTO agency_invoice_reminders
        (invoice_id, organization_id, type, offset_days, scheduled_for, channel, status)
      VALUES ${values.join(", ")}
      RETURNING ${REMINDER_COLUMNS};
    `,
    params,
  );
  return result.rows;
}

export async function listRemindersByInvoice(
  exec: Executor,
  organizationId: string,
  invoiceId: string,
): Promise<AgencyReminderRow[]> {
  const result = await exec.query<AgencyReminderRow>(
    `
      SELECT ${REMINDER_COLUMNS}
      FROM agency_invoice_reminders
      WHERE invoice_id = $1 AND organization_id = $2
      ORDER BY scheduled_for ASC;
    `,
    [invoiceId, organizationId],
  );
  return result.rows;
}

export async function findReminderById(
  exec: Executor,
  organizationId: string,
  id: string,
): Promise<AgencyReminderRow | null> {
  const result = await exec.query<AgencyReminderRow>(
    `
      SELECT ${REMINDER_COLUMNS}
      FROM agency_invoice_reminders
      WHERE id = $1 AND organization_id = $2
      LIMIT 1;
    `,
    [id, organizationId],
  );
  return result.rows[0] ?? null;
}

export async function updateReminderStatus(
  exec: Executor,
  id: string,
  status: AgencyReminderStatus,
  sentAt: Date | null,
  error: string | null,
): Promise<void> {
  await exec.query(
    `
      UPDATE agency_invoice_reminders
      SET status = $1, sent_at = $2, error = $3, updated_at = NOW()
      WHERE id = $4;
    `,
    [status, sentAt, error, id],
  );
}

export async function cancelScheduledRemindersByInvoice(
  exec: Executor,
  organizationId: string,
  invoiceId: string,
): Promise<number> {
  const result = await exec.query(
    `
      UPDATE agency_invoice_reminders
      SET status = 'cancelled', updated_at = NOW()
      WHERE invoice_id = $1
        AND organization_id = $2
        AND status = 'scheduled';
    `,
    [invoiceId, organizationId],
  );
  return result.rowCount ?? 0;
}

export async function cancelReminder(
  exec: Executor,
  organizationId: string,
  id: string,
): Promise<boolean> {
  const result = await exec.query(
    `
      UPDATE agency_invoice_reminders
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND status = 'scheduled';
    `,
    [id, organizationId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listDueReminders(
  exec: Executor,
  now: Date,
  limit = 100,
): Promise<AgencyReminderRow[]> {
  const result = await exec.query<AgencyReminderRow>(
    `
      SELECT ${REMINDER_COLUMNS}
      FROM agency_invoice_reminders
      WHERE status = 'scheduled' AND scheduled_for <= $1
      ORDER BY scheduled_for ASC
      LIMIT $2;
    `,
    [now, limit],
  );
  return result.rows;
}
