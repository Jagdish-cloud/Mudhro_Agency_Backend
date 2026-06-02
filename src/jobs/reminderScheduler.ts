import cron, { type ScheduledTask } from "node-cron";

import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import { listDueReminders } from "../repositories/agencyReminder.repository.js";
import { sendReminderEmailService } from "../services/agencyInvoiceMail.service.js";

let task: ScheduledTask | null = null;

export type SchedulerTickResult = {
  overdueUpdated: boolean;
  remindersDispatched: number;
};

async function recomputeOverdueInvoices(): Promise<void> {
  await pool.query(
    `
      UPDATE agency_invoices
      SET status = 'overdue', updated_at = NOW()
      WHERE deleted_at IS NULL
        AND status IN ('sent', 'viewed', 'partial')
        AND amount_pending > 0
        AND due_date < CURRENT_DATE;
    `,
  );

  await pool.query(
    `
      UPDATE agency_invoice_installments
      SET status = 'overdue', updated_at = NOW()
      WHERE status = 'pending' AND due_date < CURRENT_DATE;
    `,
  );
}

async function dispatchDueReminders(): Promise<number> {
  const due = await listDueReminders(pool, new Date(), 50);
  let dispatched = 0;
  for (const reminder of due) {
    if (reminder.channel !== "email") continue;
    await sendReminderEmailService(
      reminder.id,
      reminder.organization_id,
      reminder.invoice_id,
    );
    dispatched += 1;
  }
  return dispatched;
}

export async function runSchedulerTickOnce(): Promise<SchedulerTickResult> {
  try {
    await recomputeOverdueInvoices();
    const remindersDispatched = await dispatchDueReminders();
    return { overdueUpdated: true, remindersDispatched };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[reminderScheduler] tick error:", error);
    throw error;
  }
}

/**
 * Start the background reminder scheduler. No-op unless
 * ENABLE_SCHEDULER=true and NODE_ENV != 'test'.
 */
export function startReminderScheduler(): void {
  if (env.NODE_ENV === "test") return;
  if (!env.ENABLE_SCHEDULER) return;
  if (task) return;

  // Every minute: recompute overdue, then dispatch due reminders.
  task = cron.schedule("* * * * *", () => {
    void runSchedulerTickOnce();
  });
  task.start();
  // eslint-disable-next-line no-console
  console.log("[reminderScheduler] started (every 1 minute)");
}

export function stopReminderScheduler(): void {
  if (task) {
    task.stop();
    task = null;
  }
}
