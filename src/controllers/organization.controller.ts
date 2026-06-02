import type { Request, Response } from "express";

import {
  getOrganizationProfileService,
  registerOrganizationService,
} from "../services/organization.service.js";
import { HttpError } from "../utils/httpError.js";
import { ok } from "../utils/responses.js";
import { organizationRegistrationSchema } from "../validators/organizationRegistration.schema.js";

export async function registerOrganizationController(req: Request, res: Response): Promise<void> {
  const input = organizationRegistrationSchema.parse(req.body);
  const result = await registerOrganizationService(input);

  res.status(201).json(result);
}

export async function getOrganizationController(req: Request, res: Response): Promise<void> {
  const orgId = req.params.orgId;
  if (typeof orgId !== "string" || orgId.length === 0) {
    throw new HttpError(400, "orgId is required.");
  }
  const result = await getOrganizationProfileService(orgId);
  res.status(200).json(ok(result));
}
