import { Router } from "express";

import {
  assignProjectClientsController,
  createProjectController,
  deleteProjectController,
  getProjectController,
  listProjectClientsController,
  listProjectsController,
  removeProjectClientController,
  updateProjectController,
} from "../controllers/agencyProject.controller.js";

export const agencyProjectRouter = Router({ mergeParams: true });

agencyProjectRouter.get("/projects", listProjectsController);
agencyProjectRouter.post("/projects", createProjectController);
agencyProjectRouter.get("/projects/:projectId", getProjectController);
agencyProjectRouter.patch("/projects/:projectId", updateProjectController);
agencyProjectRouter.delete("/projects/:projectId", deleteProjectController);

agencyProjectRouter.get(
  "/projects/:projectId/clients",
  listProjectClientsController,
);
agencyProjectRouter.post(
  "/projects/:projectId/clients",
  assignProjectClientsController,
);
agencyProjectRouter.delete(
  "/projects/:projectId/clients/:clientId",
  removeProjectClientController,
);
