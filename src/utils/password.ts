import bcrypt from "bcryptjs";

import { env } from "../config/env.js";

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, env.BCRYPT_SALT_ROUNDS);
}
