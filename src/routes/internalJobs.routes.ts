import { Router } from "express";

import { reminderTickController } from "../controllers/internalJobs.controller.js";

export const internalJobsRouter = Router();

internalJobsRouter.post("/reminder-tick", reminderTickController);
