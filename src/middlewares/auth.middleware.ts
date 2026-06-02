import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { env } from "../config/env.js";
import type { AuthPayload, UserRole } from "../types/auth.js";
import { HttpError } from "../utils/httpError.js";

type DecodedJwt = {
  sub?: string;
  organizationId?: string;
  email?: string;
  role?: unknown;
};

function coerceRole(value: unknown): UserRole | null {
  if (value === 1 || value === 2) return value;
  if (value === "1") return 1;
  if (value === "2") return 2;
  return null;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    next(new HttpError(401, "Authentication required."));
    return;
  }

  let decoded: DecodedJwt;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET) as DecodedJwt;
  } catch {
    next(new HttpError(401, "Invalid or expired token."));
    return;
  }

  const role = coerceRole(decoded.role);
  if (!decoded.sub || !decoded.organizationId || !decoded.email || role === null) {
    next(new HttpError(401, "Malformed authentication token."));
    return;
  }

  const payload: AuthPayload = {
    id: decoded.sub,
    organizationId: decoded.organizationId,
    email: decoded.email,
    role,
  };
  req.auth = payload;
  next();
}

export function requireOrgAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) {
    next(new HttpError(401, "Authentication required."));
    return;
  }
  if (req.auth.role !== 1) {
    next(new HttpError(403, "Admins only."));
    return;
  }
  next();
}

export function requireSameOrg(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) {
    next(new HttpError(401, "Authentication required."));
    return;
  }
  const { orgId } = req.params;
  if (!orgId || orgId !== req.auth.organizationId) {
    next(new HttpError(403, "Organization scope mismatch."));
    return;
  }
  next();
}
