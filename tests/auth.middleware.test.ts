import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";

import { env } from "../src/config/env.js";
import {
  requireAuth,
  requireOrgAdmin,
  requireSameOrg,
} from "../src/middlewares/auth.middleware.js";
import { HttpError } from "../src/utils/httpError.js";

function buildReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    params: {},
    ...overrides,
  } as unknown as Request;
}

function buildRes(): Response {
  return {} as Response;
}

function runMiddleware(
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  req: Request,
): Error | null {
  let captured: unknown = null;
  const next: NextFunction = (err) => {
    captured = err ?? null;
  };
  middleware(req, buildRes(), next);
  return captured instanceof Error ? captured : null;
}

function signToken(payload: Record<string, unknown>): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "1h" });
}

describe("requireAuth", () => {
  it("rejects missing Authorization header", () => {
    const error = runMiddleware(requireAuth, buildReq());
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).statusCode).toBe(401);
  });

  it("rejects an invalid token", () => {
    const req = buildReq({ headers: { authorization: "Bearer not-a-jwt" } });
    const error = runMiddleware(requireAuth, req);
    expect((error as HttpError).statusCode).toBe(401);
  });

  it("rejects a token missing required claims", () => {
    const token = signToken({ sub: "abc" });
    const req = buildReq({ headers: { authorization: `Bearer ${token}` } });
    const error = runMiddleware(requireAuth, req);
    expect((error as HttpError).statusCode).toBe(401);
  });

  it("attaches auth context for a valid token", () => {
    const token = signToken({
      sub: "user-1",
      organizationId: "org-1",
      email: "a@b.io",
      role: 1,
    });
    const req = buildReq({ headers: { authorization: `Bearer ${token}` } });
    const error = runMiddleware(requireAuth, req);
    expect(error).toBeNull();
    expect(req.auth).toEqual({
      id: "user-1",
      organizationId: "org-1",
      email: "a@b.io",
      role: 1,
    });
  });
});

describe("requireOrgAdmin", () => {
  it("allows admins", () => {
    const req = buildReq();
    req.auth = { id: "1", organizationId: "o", email: "e", role: 1 };
    const error = runMiddleware(requireOrgAdmin, req);
    expect(error).toBeNull();
  });

  it("blocks members", () => {
    const req = buildReq();
    req.auth = { id: "1", organizationId: "o", email: "e", role: 2 };
    const error = runMiddleware(requireOrgAdmin, req);
    expect((error as HttpError).statusCode).toBe(403);
  });
});

describe("requireSameOrg", () => {
  it("allows matching organization scope", () => {
    const req = buildReq({ params: { orgId: "org-1" } });
    req.auth = { id: "1", organizationId: "org-1", email: "e", role: 1 };
    const error = runMiddleware(requireSameOrg, req);
    expect(error).toBeNull();
  });

  it("blocks cross-organization access", () => {
    const req = buildReq({ params: { orgId: "other-org" } });
    req.auth = { id: "1", organizationId: "org-1", email: "e", role: 1 };
    const error = runMiddleware(requireSameOrg, req);
    expect((error as HttpError).statusCode).toBe(403);
  });
});

void vi;
