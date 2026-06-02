import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import { findAdminByEmail } from "../repositories/adminAuth.repository.js";
import type { AdminLoginResponse } from "../types/adminAuth.js";
import { HttpError } from "../utils/httpError.js";
import type { AdminLoginInput } from "../validators/adminLogin.schema.js";

export async function adminLoginService(input: AdminLoginInput): Promise<AdminLoginResponse> {
  const row = await findAdminByEmail(pool, input.email);

  if (!row) {
    throw new HttpError(401, "Invalid email or password.");
  }

  if (row.status === "inactive") {
    throw new HttpError(403, "This account is inactive. Contact your administrator.");
  }

  const passwordOk = await bcrypt.compare(input.password, row.password_hash);
  if (!passwordOk) {
    throw new HttpError(401, "Invalid email or password.");
  }

  const token = jwt.sign(
    {
      sub: row.id,
      organizationId: row.organization_id,
      email: row.email,
      role: row.role,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] },
  );

  return {
    token,
    expiresIn: env.JWT_EXPIRES_IN,
    admin: {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
    },
    organization: {
      id: row.organization_id,
      name: row.organization_name,
    },
  };
}
