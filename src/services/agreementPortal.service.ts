import { pool } from "../db/pool.js";
import {
  findAgencyClientById,
} from "../repositories/agencyClient.repository.js";
import {
  findAgreementByIdAnyOrg,
  findClientSignature,
  findPaymentTermsByAgreement,
  insertSignature,
  listDeliverables,
  listMilestonesByAgreement,
  listSignaturesByAgreement,
  setAgreementStatus,
  deleteSignatureById,
  updateAgreementFinalPdf,
} from "../repositories/agencyAgreement.repository.js";
import {
  countSignedLinksForAgreement,
  findLinkByToken,
  markLinkSigned,
  setLinkStatus,
} from "../repositories/agreementClientLink.repository.js";
import { findAgencyProjectById } from "../repositories/agencyProject.repository.js";
import {
  toAgreementDto,
  type AgreementClientLinkRow,
  type AgreementDto,
  type AgreementRow,
} from "../types/agencyAgreement.js";
import { HttpError } from "../utils/httpError.js";
import { enrichAgreementDtoWithSignaturePreview } from "../utils/enrichAgreementDto.js";
import {
  deleteBlob,
  getFileUrl,
  isAzureConfigured,
  resolveSignatureDownloadContainer,
  uploadAgreementPdfToProject,
  uploadClientSignaturePng,
} from "./azureBlob.service.js";
import { generateAgreementPdf } from "./agreementPdf.service.js";

export type PortalAgreementPayload =
  | {
      valid: false;
      expired: boolean;
      reason: string;
    }
  | {
      valid: true;
      expired: false;
      alreadySigned: boolean;
      canResign: boolean;
      agreement: AgreementDto;
      project: {
        id: string;
        name: string;
        description: string | null;
        currency: string;
        budget: number | null;
      };
      client: {
        id: string;
        name: string;
        contactName: string | null;
        email: string | null;
      };
      organization: {
        id: string;
        name: string;
      };
      link: {
        expiresAt: string;
        status: AgreementClientLinkRow["status"];
      };
    };

function decodeBase64Image(dataUrl: string): { buffer: Buffer } {
  const match = /^data:image\/[a-zA-Z+]+;base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new HttpError(400, "Signature must be a base64-encoded image data URL.");
  }
  return { buffer: Buffer.from(match[1], "base64") };
}

async function loadAgreementForLink(link: AgreementClientLinkRow): Promise<AgreementRow> {
  const agreement = await findAgreementByIdAnyOrg(pool, link.agreement_id);
  if (!agreement) throw new HttpError(404, "Agreement not found.");
  return agreement;
}

async function loadFullAgreementDto(agreement: AgreementRow): Promise<AgreementDto> {
  const [deliverables, paymentTerm, milestones, signatures] = await Promise.all([
    listDeliverables(pool, agreement.id),
    findPaymentTermsByAgreement(pool, agreement.id),
    listMilestonesByAgreement(pool, agreement.id),
    listSignaturesByAgreement(pool, agreement.id),
  ]);
  return toAgreementDto({
    agreement,
    deliverables,
    paymentTerm,
    milestones,
    signatures,
  });
}

async function loadOrgName(organizationId: string): Promise<string> {
  const result = await pool.query<{ name: string }>(
    `SELECT name FROM organizations WHERE id = $1 LIMIT 1;`,
    [organizationId],
  );
  return result.rows[0]?.name ?? "Service Provider";
}

/**
 * Re-sign (PATCH) is only allowed while the link is still pending, the 48h
 * signing window has not passed, and the client has not completed a signature
 * yet (master prompt §6 / §7).
 */
function computeCanResign(link: AgreementClientLinkRow): boolean {
  if (link.status !== "pending") return false;
  if (link.expires_at.getTime() <= Date.now()) return false;
  return true;
}

async function maybeMarkExpired(link: AgreementClientLinkRow): Promise<AgreementClientLinkRow> {
  const isExpired =
    link.expires_at.getTime() < Date.now() &&
    link.status !== "client_signed" &&
    link.status !== "expired";
  if (!isExpired) return link;
  await setLinkStatus(pool, link.id, "expired");
  return { ...link, status: "expired" };
}

export async function getAgreementByToken(token: string): Promise<PortalAgreementPayload> {
  const linkInitial = await findLinkByToken(pool, token);
  if (!linkInitial) {
    return { valid: false, expired: false, reason: "Signing link not found." };
  }
  const link = await maybeMarkExpired(linkInitial);
  if (link.status === "expired") {
    return { valid: false, expired: true, reason: "Signing link has expired." };
  }

  const agreement = await loadAgreementForLink(link);
  const [project, client, agreementDto, orgName] = await Promise.all([
    findAgencyProjectById(pool, agreement.organization_id, agreement.project_id),
    findAgencyClientById(pool, agreement.organization_id, link.client_id),
    loadFullAgreementDto(agreement),
    loadOrgName(agreement.organization_id),
  ]);
  if (!project) {
    return { valid: false, expired: false, reason: "Project not found." };
  }
  if (!client) {
    return { valid: false, expired: false, reason: "Client not found." };
  }

  const alreadySigned = link.status === "client_signed";

  const agreementForClient = await enrichAgreementDtoWithSignaturePreview(agreementDto);

  return {
    valid: true,
    expired: false,
    alreadySigned,
    canResign: computeCanResign(link),
    agreement: agreementForClient,
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      currency: project.currency,
      budget: project.budget !== null ? Number(project.budget) : null,
    },
    client: {
      id: client.id,
      name: client.name,
      contactName: client.contact_name || null,
      email: client.email || null,
    },
    organization: {
      id: agreement.organization_id,
      name: orgName,
    },
    link: {
      expiresAt: link.expires_at.toISOString(),
      status: link.status,
    },
  };
}

/**
 * Regenerates the agreement PDF from current DB state, replaces any previous
 * blob at final_pdf_*, and returns a short-lived read URL when possible.
 */
async function persistAgreementPdfToBlob(
  agreement: AgreementRow,
): Promise<{ pdfUrl: string | null }> {
  try {
    const { buffer } = await generateAgreementPdf(
      agreement.organization_id,
      agreement.id,
    );
    if (agreement.final_pdf_blob_path && agreement.final_pdf_blob_container) {
      await deleteBlob(
        agreement.final_pdf_blob_container,
        agreement.final_pdf_blob_path,
      );
    }
    const upload = await uploadAgreementPdfToProject(
      agreement.organization_id,
      agreement.project_id,
      agreement.id,
      buffer,
    );
    await updateAgreementFinalPdf(pool, agreement.id, {
      blobPath: upload.blobPath,
      blobContainer: upload.containerName,
      byteSize: buffer.length,
      contentType: "application/pdf",
    });
    if (isAzureConfigured()) {
      try {
        const pdfUrl = await getFileUrl(upload.containerName, upload.blobPath, {
          expiresInMinutes: 60,
        });
        return { pdfUrl };
      } catch {
        return { pdfUrl: upload.url };
      }
    }
    return { pdfUrl: upload.url };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[agreement] failed to persist agreement PDF:", error);
    return { pdfUrl: null };
  }
}

async function finalizeIfAllSigned(agreementId: string): Promise<boolean> {
  const counts = await countSignedLinksForAgreement(pool, agreementId);
  if (counts.total === 0 || counts.signed < counts.total) {
    return false;
  }
  await setAgreementStatus(pool, agreementId, "completed");
  return true;
}

/**
 * Public download: token must be pending (not expired) or already used to sign.
 */
export async function streamAgreementPdfForPortalToken(
  token: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const linkInitial = await findLinkByToken(pool, token);
  if (!linkInitial) throw new HttpError(404, "Signing link not found.");
  const link = await maybeMarkExpired(linkInitial);
  if (link.status === "expired") {
    throw new HttpError(410, "Signing link has expired.");
  }
  if (link.status !== "pending" && link.status !== "client_signed") {
    throw new HttpError(400, "This link cannot be used to download the agreement.");
  }
  if (link.status === "pending" && link.expires_at.getTime() <= Date.now()) {
    throw new HttpError(410, "Signing link has expired.");
  }
  const agreement = await loadAgreementForLink(link);
  return generateAgreementPdf(agreement.organization_id, agreement.id);
}

export async function submitClientSignature(
  token: string,
  input: { signerName: string; signatureImage: string },
  ipAddress: string | null,
): Promise<{ pdfUrl: string | null; completed: boolean }> {
  const linkInitial = await findLinkByToken(pool, token);
  if (!linkInitial) throw new HttpError(404, "Signing link not found.");
  const link = await maybeMarkExpired(linkInitial);
  if (link.status === "expired") {
    throw new HttpError(410, "Signing link has expired.");
  }
  if (link.status === "client_signed") {
    throw new HttpError(409, "This agreement has already been signed by you.");
  }

  const agreement = await loadAgreementForLink(link);
  const { buffer } = decodeBase64Image(input.signatureImage);
  const upload = await uploadClientSignaturePng(
    agreement.organization_id,
    link.client_id,
    agreement.id,
    buffer,
  );

  await insertSignature(pool, {
    agreementId: agreement.id,
    signerType: "client",
    clientId: link.client_id,
    signerName: input.signerName,
    signatureImageName: upload.blobPath.split("/").pop() ?? null,
    signatureImagePath: upload.blobPath,
    blobContainer: upload.containerName,
    ipAddress,
    documentId: agreement.document_id,
  });
  await markLinkSigned(pool, token);

  const fresh = await findAgreementByIdAnyOrg(pool, agreement.id);
  if (!fresh) throw new HttpError(500, "Agreement not found after signing.");
  const { pdfUrl } = await persistAgreementPdfToBlob(fresh);
  const completed = await finalizeIfAllSigned(fresh.id);
  return { pdfUrl, completed };
}

export async function resignClientSignature(
  token: string,
  input: { signerName: string; signatureImage: string },
  ipAddress: string | null,
): Promise<{ pdfUrl: string | null; completed: boolean }> {
  const linkInitial = await findLinkByToken(pool, token);
  if (!linkInitial) throw new HttpError(404, "Signing link not found.");
  const link = await maybeMarkExpired(linkInitial);
  if (link.status === "expired" || link.expires_at.getTime() <= Date.now()) {
    throw new HttpError(410, "Signing link has expired.");
  }
  if (link.status === "client_signed") {
    throw new HttpError(
      400,
      "This agreement has already been signed. Re-sign is not available once the link is completed.",
    );
  }

  const agreement = await loadAgreementForLink(link);
  // Orphan client signature row (e.g. partial failure): remove before re-submitting.
  const previous = await findClientSignature(pool, agreement.id, link.client_id);
  if (previous) {
    if (previous.signature_image_path) {
      await deleteBlob(
        resolveSignatureDownloadContainer(
          previous.signature_image_path,
          previous.blob_container,
        ),
        previous.signature_image_path,
      );
    }
    await deleteSignatureById(pool, previous.id);
  }

  const { buffer } = decodeBase64Image(input.signatureImage);
  const upload = await uploadClientSignaturePng(
    agreement.organization_id,
    link.client_id,
    agreement.id,
    buffer,
  );

  await insertSignature(pool, {
    agreementId: agreement.id,
    signerType: "client",
    clientId: link.client_id,
    signerName: input.signerName,
    signatureImageName: upload.blobPath.split("/").pop() ?? null,
    signatureImagePath: upload.blobPath,
    blobContainer: upload.containerName,
    ipAddress,
    documentId: agreement.document_id,
  });
  await markLinkSigned(pool, token);

  const fresh = await findAgreementByIdAnyOrg(pool, agreement.id);
  if (!fresh) throw new HttpError(500, "Agreement not found after signing.");
  const { pdfUrl } = await persistAgreementPdfToBlob(fresh);
  const completed = await finalizeIfAllSigned(fresh.id);
  return { pdfUrl, completed };
}
