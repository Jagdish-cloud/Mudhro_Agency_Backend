import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { HttpError } from "../utils/httpError.js";

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const dbError = err as { code?: string; message?: string } | undefined;
  const parseError = err as { status?: number; type?: string; message?: string } | undefined;

  if (parseError?.status === 400 && parseError?.type === "entity.parse.failed") {
    res.status(400).json({
      message: "Invalid JSON body. Check for trailing commas, missing brackets, or malformed quotes.",
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      message: "Validation failed",
      errors: err.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  if (dbError?.code === "23505") {
    res.status(409).json({ message: "Duplicate record conflict." });
    return;
  }

  res.status(500).json({
    message: "Internal server error",
    detail: process.env.NODE_ENV === "development" ? dbError?.message : undefined,
  });
}
