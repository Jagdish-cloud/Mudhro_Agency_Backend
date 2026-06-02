import type { Request, Response } from "express";

import { adminLoginService } from "../services/adminAuth.service.js";
import { adminLoginSchema } from "../validators/adminLogin.schema.js";

export async function adminLoginController(req: Request, res: Response): Promise<void> {
  const input = adminLoginSchema.parse(req.body);
  const result = await adminLoginService(input);
  res.status(200).json(result);
}
