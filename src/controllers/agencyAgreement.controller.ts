import type { Request, Response } from "express";

import { generateAgreementPdf } from "../services/agreementPdf.service.js";
import { sendAgreementToClients } from "../services/agreementMail.service.js";
import {
  createAgencyAgreementService,
  deleteAgreementService,
  getAgreementByProjectService,
  getAgreementService,
  updateAgreementService,
} from "../services/agencyAgreement.service.js";
import { decodeId } from "../utils/idCodec.js";
import { HttpError } from "../utils/httpError.js";
import { created, ok } from "../utils/responses.js";
import {
  createAgreementSchema,
  sendAgreementSchema,
  updateAgreementSchema,
} from "../validators/agencyAgreement.schema.js";
import { enrichAgreementDtoWithSignaturePreview } from "../utils/enrichAgreementDto.js";

function requireAuth(req: Request) {
  if (!req.auth) throw new HttpError(401, "Authentication required.");
  return req.auth;
}

function getParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, `${name} is required.`);
  }
  return value;
}

export async function createAgreementController(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const orgId = getParam(req, "orgId");
  const projectId = decodeId(getParam(req, "projectId"));
  const input = createAgreementSchema.parse(req.body);
  const result = await createAgencyAgreementService(
    orgId,
    auth.id,
    projectId,
    req.ip ?? null,
    input,
  );
  const enriched = await enrichAgreementDtoWithSignaturePreview(result);
  res.status(201).json(created(enriched, "Agreement created successfully."));
}

export async function getAgreementByProjectController(
  req: Request,
  res: Response,
): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const projectId = decodeId(getParam(req, "projectId"));
  const result = await getAgreementByProjectService(orgId, projectId);
  res.status(200).json(ok(await enrichAgreementDtoWithSignaturePreview(result)));
}

export async function getAgreementController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = decodeId(getParam(req, "agreementId"));
  const result = await getAgreementService(orgId, id);
  res.status(200).json(ok(await enrichAgreementDtoWithSignaturePreview(result)));
}

export async function updateAgreementController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = decodeId(getParam(req, "agreementId"));
  const input = updateAgreementSchema.parse(req.body);
  const result = await updateAgreementService(orgId, id, input);
  res.status(200).json(
    ok(await enrichAgreementDtoWithSignaturePreview(result), "Agreement updated successfully."),
  );
}

export async function deleteAgreementController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = decodeId(getParam(req, "agreementId"));
  await deleteAgreementService(orgId, id);
  res.status(200).json(ok({ id }, "Agreement deleted successfully."));
}

export async function getAgreementPdfController(req: Request, res: Response): Promise<void> {
  requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = decodeId(getParam(req, "agreementId"));
  const { buffer, filename } = await generateAgreementPdf(orgId, id);
  res
    .status(200)
    .setHeader("Content-Type", "application/pdf")
    .setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    .send(buffer);
}

export async function sendAgreementController(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const orgId = getParam(req, "orgId");
  const id = decodeId(getParam(req, "agreementId"));
  const input = sendAgreementSchema.parse(req.body);
  const result = await sendAgreementToClients(orgId, auth.id, id, input.clientIds, req);
  const failures = result.results.filter((r) => !r.delivered);
  res.status(200).json(
    ok(
      {
        agreementId: result.agreementId,
        sent: result.results.length - failures.length,
        failures,
        results: result.results,
      },
      failures.length === 0
        ? "Agreement sent to all selected clients."
        : `Agreement sent with ${failures.length} failure(s).`,
    ),
  );
}
