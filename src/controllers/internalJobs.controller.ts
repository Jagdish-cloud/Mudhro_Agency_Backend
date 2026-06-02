import type { Request, Response } from "express";

import { env } from "../config/env.js";
import { runSchedulerTickOnce } from "../jobs/reminderScheduler.js";
import { HttpError } from "../utils/httpError.js";

export async function reminderTickController(_req: Request, res: Response): Promise<void> {
  if (!env.SCHEDULER_SECRET) {
    throw new HttpError(503, "Scheduler secret is not configured.");
  }

  const secret = _req.header("x-scheduler-secret");
  if (!secret || secret !== env.SCHEDULER_SECRET) {
    throw new HttpError(401, "Invalid scheduler secret.");
  }

  const result = await runSchedulerTickOnce();
  res.status(200).json({ ok: true, ...result });
}
