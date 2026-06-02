import { Router } from "express";

import {
  createAdminController,
  createMemberController,
  deleteMemberController,
  listMembersController,
  updateMemberController,
} from "../controllers/member.controller.js";
import { requireOrgAdmin } from "../middlewares/auth.middleware.js";

export const memberRouter = Router({ mergeParams: true });

// Any authenticated member of the org can view the roster.
memberRouter.get("/members", listMembersController);

// Mutations are admin-only.
memberRouter.post("/admins", requireOrgAdmin, createAdminController);
memberRouter.post("/members", requireOrgAdmin, createMemberController);
memberRouter.patch("/members/:id", requireOrgAdmin, updateMemberController);
memberRouter.delete("/members/:id", requireOrgAdmin, deleteMemberController);
