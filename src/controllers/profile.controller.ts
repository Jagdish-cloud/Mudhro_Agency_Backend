import type { Request, Response } from "express";

import {
  changeMyPasswordService,
  getMyProfileService,
  updateMyProfileService,
} from "../services/profile.service.js";
import { HttpError } from "../utils/httpError.js";
import { ok } from "../utils/responses.js";
import {
  changePasswordSchema,
  updateSelfProfileSchema,
} from "../validators/profile.schema.js";

function requireAuthPayload(req: Request) {
  if (!req.auth) {
    throw new HttpError(401, "Authentication required.");
  }
  return req.auth;
}

export async function getMeController(req: Request, res: Response): Promise<void> {
  const actor = requireAuthPayload(req);
  const result = await getMyProfileService(actor);
  res.status(200).json(ok(result));
}

export async function updateMyProfileController(req: Request, res: Response): Promise<void> {
  const actor = requireAuthPayload(req);
  const input = updateSelfProfileSchema.parse(req.body);
  const result = await updateMyProfileService(actor, input);
  res.status(200).json(ok(result, "Profile updated successfully."));
}

export async function changeMyPasswordController(req: Request, res: Response): Promise<void> {
  const actor = requireAuthPayload(req);
  const input = changePasswordSchema.parse(req.body);
  await changeMyPasswordService(actor, input);
  res.status(200).json(ok({}, "Password updated successfully."));
}
