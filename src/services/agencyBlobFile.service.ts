import { pool } from "../db/pool.js";
import {
  countAgreementsUsingFinalPdfPath,
  countSignaturesUsingBlobPath,
  findAgreementPdfAssetByAgreementId,
  findSignatureBlobAssetBySignatureId,
  listAgreementPdfAssets,
  listSignatureBlobsAsAssets,
  type AgreementFileAssetRow,
} from "../repositories/agencyAgreement.repository.js";
import {
  findAgencyProjectFileById,
  insertAgencyProjectFile,
  listAgencyProjectFiles,
  softDeleteAgencyProjectFile,
  updateAgencyProjectFileOriginalName,
  type AgencyProjectFileRow,
} from "../repositories/agencyProjectFile.repository.js";
import { findAgencyClientById } from "../repositories/agencyClient.repository.js";
import { findAgencyProjectById } from "../repositories/agencyProject.repository.js";
import {
  deleteBlob,
  getFileUrl,
  isAzureConfigured,
  uploadClientAgreementFolderFile,
  uploadProjectAgreementFolderFile,
} from "./azureBlob.service.js";
import { HttpError } from "../utils/httpError.js";
import type {
  CreateAgencyBlobFileInput,
  ListAgencyBlobFilesQuery,
  PatchAgencyBlobFileInput,
} from "../validators/agencyBlobFile.schema.js";

export type AgencyBlobFileKind =
  | "service_provider_signature"
  | "client_signature"
  | "agreement_pdf"
  | "other";

export type AgencyBlobFileDto = {
  id: string;
  organizationId: string;
  fileKind: AgencyBlobFileKind;
  projectId: string | null;
  clientId: string | null;
  agreementId: string | null;
  containerName: string;
  blobPath: string;
  originalFilename: string | null;
  contentType: string | null;
  byteSize: number | null;
  createdAt: string;
  readUrl?: string;
};

function safeFilename(name: string): string {
  const trimmed = name.trim().slice(0, 200);
  const base = trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return base.length > 0 ? base : "file";
}

function assetRowToDto(row: AgreementFileAssetRow, readUrl?: string): AgencyBlobFileDto {
  return {
    id: row.composite_id,
    organizationId: row.organization_id,
    fileKind: row.file_kind as AgencyBlobFileKind,
    projectId: row.project_id,
    clientId: row.client_id,
    agreementId: row.agreement_id,
    containerName: row.container_name ?? "",
    blobPath: row.blob_path,
    originalFilename: row.original_filename,
    contentType: row.content_type,
    byteSize: row.byte_size != null ? Number(row.byte_size) : null,
    createdAt: row.created_at.toISOString(),
    ...(readUrl ? { readUrl } : {}),
  };
}

function projectFileToAsset(row: AgencyProjectFileRow): AgreementFileAssetRow {
  return {
    composite_id: row.id,
    organization_id: row.organization_id,
    file_kind: "other",
    project_id: row.project_id,
    client_id: row.client_id,
    agreement_id: row.agreement_id,
    container_name: row.container_name,
    blob_path: row.blob_path,
    original_filename: row.original_filename,
    content_type: row.content_type,
    byte_size: row.byte_size,
    created_at: row.created_at,
  };
}

function projectRowToDto(row: AgencyProjectFileRow, readUrl?: string): AgencyBlobFileDto {
  return assetRowToDto(projectFileToAsset(row), readUrl);
}

export async function createAgencyBlobFileService(
  organizationId: string,
  input: CreateAgencyBlobFileInput,
): Promise<AgencyBlobFileDto> {
  if (!isAzureConfigured()) {
    throw new HttpError(500, "Azure Blob Storage is not configured.");
  }

  const projectId = input.projectId ?? null;
  const clientId = input.clientId ?? null;

  if (projectId) {
    const project = await findAgencyProjectById(pool, organizationId, projectId);
    if (!project) throw new HttpError(404, "Project not found.");
  }
  if (clientId) {
    const client = await findAgencyClientById(pool, organizationId, clientId);
    if (!client) throw new HttpError(404, "Client not found.");
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(input.fileBase64, "base64");
  } catch {
    throw new HttpError(400, "Invalid base64 file payload.");
  }
  if (buffer.length === 0) {
    throw new HttpError(400, "Empty file.");
  }

  const name = safeFilename(input.originalFilename ?? "upload");

  let upload: { containerName: string; blobPath: string; url: string };
  if (projectId) {
    upload = await uploadProjectAgreementFolderFile(
      organizationId,
      projectId,
      name,
      buffer,
      input.contentType,
    );
  } else if (clientId) {
    upload = await uploadClientAgreementFolderFile(
      organizationId,
      clientId,
      name,
      buffer,
      input.contentType,
    );
  } else {
    throw new HttpError(400, "projectId or clientId is required.");
  }

  const row = await insertAgencyProjectFile(pool, {
    organizationId,
    projectId,
    clientId,
    agreementId: input.agreementId ?? null,
    containerName: upload.containerName,
    blobPath: upload.blobPath,
    originalFilename: input.originalFilename ?? name,
    contentType: input.contentType,
    byteSize: buffer.length,
  });

  return projectRowToDto(row);
}

export async function listAgencyBlobFilesService(
  organizationId: string,
  query: ListAgencyBlobFilesQuery,
): Promise<{ items: AgencyBlobFileDto[]; total: number }> {
  const merged: AgreementFileAssetRow[] = [];
  const fk = query.fileKind;

  const wantSig =
    fk === undefined ||
    fk === "service_provider_signature" ||
    fk === "client_signature";
  const wantPdf = fk === undefined || fk === "agreement_pdf";
  const wantOther = fk === undefined || fk === "other";

  if (wantSig) {
    if (fk === "service_provider_signature") {
      merged.push(
        ...(await listSignatureBlobsAsAssets(pool, organizationId, {
          projectId: query.projectId,
          clientId: query.clientId,
          fileKind: "service_provider_signature",
        })),
      );
    } else if (fk === "client_signature") {
      merged.push(
        ...(await listSignatureBlobsAsAssets(pool, organizationId, {
          projectId: query.projectId,
          clientId: query.clientId,
          fileKind: "client_signature",
        })),
      );
    } else {
      merged.push(
        ...(await listSignatureBlobsAsAssets(pool, organizationId, {
          projectId: query.projectId,
          clientId: query.clientId,
        })),
      );
    }
  }

  if (wantPdf) {
    merged.push(
      ...(await listAgreementPdfAssets(pool, organizationId, {
        projectId: query.projectId,
      })),
    );
  }

  if (wantOther) {
    const { rows } = await listAgencyProjectFiles(pool, organizationId, {
      projectId: query.projectId ?? undefined,
      clientId: query.clientId ?? undefined,
      limit: 50_000,
      offset: 0,
    });
    merged.push(...rows.map(projectFileToAsset));
  }

  merged.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  const total = merged.length;
  const slice = merged.slice(query.offset, query.offset + query.limit);
  return { items: slice.map((r) => assetRowToDto(r)), total };
}

export async function getAgencyBlobFileService(
  organizationId: string,
  id: string,
  withReadUrl: boolean,
): Promise<AgencyBlobFileDto> {
  let row: AgreementFileAssetRow | null = null;

  if (id.startsWith("sig:")) {
    const sigId = id.slice(4);
    row = await findSignatureBlobAssetBySignatureId(pool, organizationId, sigId);
  } else if (id.startsWith("pdf:")) {
    const agrId = id.slice(4);
    row = await findAgreementPdfAssetByAgreementId(pool, organizationId, agrId);
  } else {
    const pf = await findAgencyProjectFileById(pool, organizationId, id);
    if (pf) {
      return getProjectFileDtoWithOptionalUrl(pf, withReadUrl);
    }
  }

  if (!row) throw new HttpError(404, "File not found.");

  let readUrl: string | undefined;
  if (withReadUrl && isAzureConfigured() && row.container_name && row.blob_path) {
    try {
      readUrl = await getFileUrl(row.container_name, row.blob_path, { expiresInMinutes: 60 });
    } catch {
      readUrl = undefined;
    }
  }
  return assetRowToDto(row, readUrl);
}

async function getProjectFileDtoWithOptionalUrl(
  pf: AgencyProjectFileRow,
  withReadUrl: boolean,
): Promise<AgencyBlobFileDto> {
  let readUrl: string | undefined;
  if (withReadUrl && isAzureConfigured()) {
    try {
      readUrl = await getFileUrl(pf.container_name, pf.blob_path, { expiresInMinutes: 60 });
    } catch {
      readUrl = undefined;
    }
  }
  return projectRowToDto(pf, readUrl);
}

export async function patchAgencyBlobFileService(
  organizationId: string,
  id: string,
  input: PatchAgencyBlobFileInput,
): Promise<AgencyBlobFileDto> {
  if (id.startsWith("sig:") || id.startsWith("pdf:")) {
    throw new HttpError(
      400,
      "Only project attachments can be renamed; agreement signatures and PDFs are managed elsewhere.",
    );
  }
  const row = await updateAgencyProjectFileOriginalName(
    pool,
    organizationId,
    id,
    input.originalFilename,
  );
  if (!row) throw new HttpError(404, "File not found.");
  return projectRowToDto(row);
}

export async function deleteAgencyBlobFileService(
  organizationId: string,
  id: string,
): Promise<void> {
  if (id.startsWith("sig:") || id.startsWith("pdf:")) {
    throw new HttpError(
      400,
      "Only project attachments can be deleted here; use agreement flows for signatures and PDFs.",
    );
  }

  const existing = await findAgencyProjectFileById(pool, organizationId, id);
  if (!existing) throw new HttpError(404, "File not found.");

  const sigRefs = await countSignaturesUsingBlobPath(
    pool,
    organizationId,
    existing.blob_path,
  );
  if (sigRefs > 0) {
    throw new HttpError(
      409,
      "This blob is still referenced by an agreement signature; remove the signature first.",
    );
  }
  const pdfRefs = await countAgreementsUsingFinalPdfPath(
    pool,
    organizationId,
    existing.blob_path,
  );
  if (pdfRefs > 0) {
    throw new HttpError(
      409,
      "This blob matches a stored agreement PDF; remove or replace it via agreement completion flows.",
    );
  }

  const row = await softDeleteAgencyProjectFile(pool, organizationId, id);
  if (!row) throw new HttpError(404, "File not found.");

  if (isAzureConfigured()) {
    await deleteBlob(row.container_name, row.blob_path);
  }
}
