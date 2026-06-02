import type { Request, Response } from "express";

import {
  getAgreementByToken,
  resignClientSignature,
  streamAgreementPdfForPortalToken,
  submitClientSignature,
} from "../services/agreementPortal.service.js";
import { HttpError } from "../utils/httpError.js";
import { ok } from "../utils/responses.js";
import { portalSignSchema } from "../validators/agencyAgreement.schema.js";

function getToken(req: Request): string {
  const token = req.params.token;
  if (typeof token !== "string" || token.length === 0) {
    throw new HttpError(400, "token is required.");
  }
  return token;
}

export async function getPortalAgreementController(
  req: Request,
  res: Response,
): Promise<void> {
  const token = getToken(req);
  const payload = await getAgreementByToken(token);
  res.status(200).json(ok(payload));
}

export async function getPortalAgreementPdfController(
  req: Request,
  res: Response,
): Promise<void> {
  const token = getToken(req);
  const { buffer, filename } = await streamAgreementPdfForPortalToken(token);
  res
    .status(200)
    .setHeader("Content-Type", "application/pdf")
    .setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    .send(buffer);
}

export async function postPortalAgreementController(
  req: Request,
  res: Response,
): Promise<void> {
  const token = getToken(req);
  const input = portalSignSchema.parse(req.body);
  const result = await submitClientSignature(
    token,
    { signerName: input.signerName, signatureImage: input.signatureImage },
    req.ip ?? null,
  );
  res.status(200).json(
    ok(result, result.completed ? "Agreement fully signed." : "Signature recorded."),
  );
}

export async function patchPortalAgreementController(
  req: Request,
  res: Response,
): Promise<void> {
  const token = getToken(req);
  const input = portalSignSchema.parse(req.body);
  const result = await resignClientSignature(
    token,
    { signerName: input.signerName, signatureImage: input.signatureImage },
    req.ip ?? null,
  );
  res.status(200).json(
    ok(result, result.completed ? "Agreement fully signed." : "Signature updated."),
  );
}
