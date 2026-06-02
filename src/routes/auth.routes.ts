import { Router } from "express";

import { adminLoginController } from "../controllers/adminAuth.controller.js";
import {
  changeMyPasswordController,
  getMeController,
  updateMyProfileController,
} from "../controllers/profile.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

export const authRouter = Router();

authRouter.post("/admin/login", adminLoginController);
authRouter.get("/me", requireAuth, getMeController);
authRouter.patch("/me", requireAuth, updateMyProfileController);
authRouter.patch("/me/password", requireAuth, changeMyPasswordController);
