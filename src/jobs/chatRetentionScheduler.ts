import cron, { type ScheduledTask } from "node-cron";

import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import * as repo from "../repositories/internalChat.repository.js";
import { deleteBlob } from "../services/azureBlob.service.js";

let task: ScheduledTask | null = null;

export async function runChatRetentionOnce(): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - env.CHAT_RETENTION_DAYS);

  await repo.deleteOldMessagesAndRelated(pool, cutoff);

  const orphans = await repo.listOrphanChatFiles(pool, cutoff);
  for (const f of orphans) {
    await deleteBlob(f.blob_container, f.blob_path);
    await repo.deleteChatFileRow(pool, f.id);
  }
}

export function startChatRetentionScheduler(): void {
  if (env.NODE_ENV === "test") return;
  if (!env.ENABLE_SCHEDULER) return;
  if (task) return;

  task = cron.schedule("15 3 * * *", () => {
    void runChatRetentionOnce().catch((err) =>
      console.error("[chatRetentionScheduler]", err),
    );
  });
  task.start();
  console.log("[chatRetentionScheduler] started (daily ~03:15)");
}
