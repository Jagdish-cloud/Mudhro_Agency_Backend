import type { UserRole } from "./auth.js";

export type AdminLoginResponse = {
  token: string;
  expiresIn: string;
  admin: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  };
  organization: {
    id: string;
    name: string;
  };
};
