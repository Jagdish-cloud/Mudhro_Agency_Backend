import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import {
  deleteDeliverables,
  deletePaymentTerms,
  findAgreementById,
  findAgreementByProjectId,
  findPaymentTermsByAgreement,
  insertAgreement,
  insertDeliverables,
  insertMilestones,
  insertPaymentTerms,
  insertSignature,
  listDeliverables,
  listMilestonesByAgreement,
  listSignaturesByAgreement,
  softDeleteAgreement,
  updateAgreementCore,
  updateAgreementDocumentId,
  type AgreementCorePatch,
} from "../repositories/agencyAgreement.repository.js";
import { findAgencyProjectById } from "../repositories/agencyProject.repository.js";
import {
  toAgreementDto,
  type AgreementDto,
  type AgreementRow,
} from "../types/agencyAgreement.js";
import { HttpError } from "../utils/httpError.js";
import type {
  CreateAgreementInput,
  UpdateAgreementInput,
} from "../validators/agencyAgreement.schema.js";
import { uploadServiceProviderSignaturePng } from "./azureBlob.service.js";

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

function decodeBase64Image(dataUrl: string): { buffer: Buffer; mime: string } {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new HttpError(400, "Signature must be a base64-encoded image data URL.");
  }
  const mime = match[1];
  const buffer = Buffer.from(match[2], "base64");
  return { buffer, mime };
}

async function loadFullAgreement(agreementRow: AgreementRow): Promise<AgreementDto> {
  const [deliverables, paymentTerm, milestones, signatures] = await Promise.all([
    listDeliverables(pool, agreementRow.id),
    findPaymentTermsByAgreement(pool, agreementRow.id),
    listMilestonesByAgreement(pool, agreementRow.id),
    listSignaturesByAgreement(pool, agreementRow.id),
  ]);
  return toAgreementDto({
    agreement: agreementRow,
    deliverables,
    paymentTerm,
    milestones,
    signatures,
  });
}

function assertWithinEditWindow(agreement: AgreementRow): void {
  const created = agreement.created_at.getTime();
  if (Date.now() - created > TWO_DAYS_MS) {
    throw new HttpError(
      400,
      "This agreement can no longer be edited; the 2-day edit window has expired.",
    );
  }
}

function validateMilestoneBudget(
  paymentStructure: string,
  milestones: Array<{ amount: number }>,
  budget: number | null,
): void {
  if (paymentStructure !== "milestone-based") return;
  if (budget === null || budget === undefined) return;
  const total = milestones.reduce((sum, m) => sum + m.amount, 0);
  if (total > budget + 0.005) {
    throw new HttpError(
      400,
      `Milestone amounts (${total.toFixed(2)}) exceed the project budget (${budget.toFixed(2)}).`,
    );
  }
}

export async function createAgencyAgreementService(
  organizationId: string,
  createdByOrgUserId: string,
  projectId: string,
  ipAddress: string | null,
  input: CreateAgreementInput,
): Promise<AgreementDto> {
  const project = await findAgencyProjectById(pool, organizationId, projectId);
  if (!project) throw new HttpError(404, "Project not found.");

  const existing = await findAgreementByProjectId(pool, organizationId, projectId);
  if (existing) {
    throw new HttpError(
      409,
      "An agreement already exists for this project. Use PATCH to update it.",
    );
  }

  validateMilestoneBudget(
    input.paymentTerms.paymentStructure,
    input.paymentTerms.milestones ?? [],
    project.budget !== null ? Number(project.budget) : null,
  );

  // 1) Insert the core agreement.
  const inserted = await insertAgreement(pool, {
    organizationId,
    projectId,
    createdByOrgUserId,
    serviceProviderName: input.serviceProviderName,
    agreementDate: input.agreementDate,
    serviceType: input.serviceType,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    duration: input.duration ?? null,
    durationUnit: input.durationUnit ?? null,
    numberOfRevisions: input.numberOfRevisions ?? 0,
    jurisdiction: input.jurisdiction ?? null,
  });

  const documentId = `AGREEMENT-${inserted.id}-${Date.now()}`;
  await updateAgreementDocumentId(pool, inserted.id, documentId);

  // 2) Insert deliverables (filter empty just in case the client sent any).
  const cleanDeliverables = (input.deliverables ?? [])
    .map((d) => ({ description: d.description.trim() }))
    .filter((d) => d.description.length > 0);
  await insertDeliverables(pool, inserted.id, cleanDeliverables);

  // 3) Insert payment terms + (optional) milestones.
  const term = await insertPaymentTerms(
    pool,
    inserted.id,
    input.paymentTerms.paymentStructure,
    input.paymentTerms.paymentMethod ?? null,
  );
  if (
    input.paymentTerms.paymentStructure === "milestone-based" &&
    input.paymentTerms.milestones.length > 0
  ) {
    await insertMilestones(
      pool,
      term.id,
      input.paymentTerms.milestones.map((m) => ({
        description: m.description,
        amount: m.amount,
        date: m.date ?? null,
      })),
    );
  }

  // 4) Upload service-provider signature and insert signature row.
  const { buffer } = decodeBase64Image(input.serviceProviderSignatureImage);
  const upload = await uploadServiceProviderSignaturePng(organizationId, projectId, inserted.id, buffer);
  await insertSignature(pool, {
    agreementId: inserted.id,
    signerType: "service_provider",
    clientId: null,
    signerName: input.serviceProviderSignerName,
    signatureImageName: upload.blobPath.split("/").pop() ?? null,
    signatureImagePath: upload.blobPath,
    blobContainer: upload.containerName,
    ipAddress,
    documentId,
  });

  const fresh = await findAgreementById(pool, organizationId, inserted.id);
  if (!fresh) throw new HttpError(500, "Failed to load created agreement.");
  return loadFullAgreement(fresh);
}

export async function getAgreementService(
  organizationId: string,
  agreementId: string,
): Promise<AgreementDto> {
  const row = await findAgreementById(pool, organizationId, agreementId);
  if (!row) throw new HttpError(404, "Agreement not found.");
  return loadFullAgreement(row);
}

export async function getAgreementByProjectService(
  organizationId: string,
  projectId: string,
): Promise<AgreementDto> {
  const row = await findAgreementByProjectId(pool, organizationId, projectId);
  if (!row) throw new HttpError(404, "Agreement not found for this project.");
  return loadFullAgreement(row);
}

export async function updateAgreementService(
  organizationId: string,
  agreementId: string,
  input: UpdateAgreementInput,
): Promise<AgreementDto> {
  const existing = await findAgreementById(pool, organizationId, agreementId);
  if (!existing) throw new HttpError(404, "Agreement not found.");
  assertWithinEditWindow(existing);

  const project = await findAgencyProjectById(pool, organizationId, existing.project_id);
  if (input.paymentTerms?.paymentStructure === "milestone-based") {
    validateMilestoneBudget(
      "milestone-based",
      input.paymentTerms.milestones ?? [],
      project && project.budget !== null ? Number(project.budget) : null,
    );
  }

  const patch: AgreementCorePatch = {};
  if (input.serviceProviderName !== undefined) patch.service_provider_name = input.serviceProviderName;
  if (input.agreementDate !== undefined) patch.agreement_date = input.agreementDate;
  if (input.serviceType !== undefined) patch.service_type = input.serviceType;
  if (input.startDate !== undefined) patch.start_date = input.startDate;
  if (input.endDate !== undefined) patch.end_date = input.endDate;
  if (input.duration !== undefined) patch.duration = input.duration;
  if (input.durationUnit !== undefined) patch.duration_unit = input.durationUnit;
  if (input.numberOfRevisions !== undefined) patch.number_of_revisions = input.numberOfRevisions;
  if (input.jurisdiction !== undefined) patch.jurisdiction = input.jurisdiction ?? null;

  if (Object.keys(patch).length > 0) {
    const updated = await updateAgreementCore(pool, organizationId, agreementId, patch);
    if (!updated) throw new HttpError(404, "Agreement not found.");
  }

  if (input.deliverables !== undefined) {
    await deleteDeliverables(pool, agreementId);
    const cleanDeliverables = input.deliverables
      .map((d) => ({ description: d.description.trim() }))
      .filter((d) => d.description.length > 0);
    await insertDeliverables(pool, agreementId, cleanDeliverables);
  }

  if (input.paymentTerms !== undefined) {
    // payment_terms cascade-deletes its milestones via FK ON DELETE CASCADE.
    await deletePaymentTerms(pool, agreementId);
    const term = await insertPaymentTerms(
      pool,
      agreementId,
      input.paymentTerms.paymentStructure,
      input.paymentTerms.paymentMethod ?? null,
    );
    if (
      input.paymentTerms.paymentStructure === "milestone-based" &&
      input.paymentTerms.milestones.length > 0
    ) {
      await insertMilestones(
        pool,
        term.id,
        input.paymentTerms.milestones.map((m) => ({
          description: m.description,
          amount: m.amount,
          date: m.date ?? null,
        })),
      );
    }
  }

  const fresh = await findAgreementById(pool, organizationId, agreementId);
  if (!fresh) throw new HttpError(404, "Agreement not found.");
  return loadFullAgreement(fresh);
}

export async function deleteAgreementService(
  organizationId: string,
  agreementId: string,
): Promise<void> {
  const existing = await findAgreementById(pool, organizationId, agreementId);
  if (!existing) throw new HttpError(404, "Agreement not found.");
  const removed = await softDeleteAgreement(pool, organizationId, agreementId);
  if (!removed) throw new HttpError(404, "Agreement not found.");
}

export function isAgreementSendable(agreement: AgreementRow): boolean {
  return Date.now() - agreement.created_at.getTime() <= TWO_DAYS_MS;
}

export const AGREEMENT_EDIT_WINDOW_MS = TWO_DAYS_MS;

// Export env-driven helper for the front-end public link base. Lives here so
// tests can stub it cheaply.
export function getAgreementSignBaseUrl(req?: { protocol: string; get(name: string): string | undefined }): string {
  const fromEnv = env.FRONTEND_URL ?? env.CLIENT_URL ?? env.APP_PUBLIC_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (env.NODE_ENV === "production" && req) {
    const host = req.get("host");
    if (host) return `${req.protocol}://${host}`;
  }
  return "http://localhost:5173";
}
