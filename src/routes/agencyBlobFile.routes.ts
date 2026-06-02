import { Router } from "express";

import {
  createAgencyBlobFileController,
  deleteAgencyBlobFileController,
  getAgencyBlobFileController,
  listAgencyBlobFilesController,
  patchAgencyBlobFileController,
} from "../controllers/agencyBlobFile.controller.js";

export const agencyBlobFileRouter = Router({ mergeParams: true });

agencyBlobFileRouter.post("/agency/files", createAgencyBlobFileController);
agencyBlobFileRouter.get("/agency/files", listAgencyBlobFilesController);
agencyBlobFileRouter.get("/agency/files/:fileId", getAgencyBlobFileController);
agencyBlobFileRouter.patch("/agency/files/:fileId", patchAgencyBlobFileController);
agencyBlobFileRouter.delete("/agency/files/:fileId", deleteAgencyBlobFileController);
