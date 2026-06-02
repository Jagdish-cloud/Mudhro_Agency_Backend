import {
  BlobSASPermissions,
  BlobServiceClient,
  ContainerClient,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";

import { env } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

let cachedClient: BlobServiceClient | null = null;
let cachedCredential: StorageSharedKeyCredential | null = null;

function parseAccountFromConnectionString(conn: string): {
  accountName: string;
  accountKey: string;
} | null {
  const parts = conn.split(";").reduce<Record<string, string>>((acc, kv) => {
    const idx = kv.indexOf("=");
    if (idx <= 0) return acc;
    const key = kv.slice(0, idx).trim();
    const value = kv.slice(idx + 1).trim();
    if (key && value) acc[key] = value;
    return acc;
  }, {});
  const accountName = parts.AccountName;
  const accountKey = parts.AccountKey;
  if (!accountName || !accountKey) return null;
  return { accountName, accountKey };
}

function getClient(): BlobServiceClient {
  if (cachedClient) return cachedClient;
  const conn = env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) {
    throw new HttpError(
      500,
      "Azure Blob Storage is not configured. Set AZURE_STORAGE_CONNECTION_STRING.",
    );
  }
  cachedClient = BlobServiceClient.fromConnectionString(conn);
  const parsed = parseAccountFromConnectionString(conn);
  if (parsed) {
    cachedCredential = new StorageSharedKeyCredential(parsed.accountName, parsed.accountKey);
  }
  return cachedClient;
}

async function getOrCreateContainer(name: string): Promise<ContainerClient> {
  const client = getClient();
  const container = client.getContainerClient(name);
  try {
    await container.createIfNotExists();
  } catch {
    // createIfNotExists is best-effort; if it fails due to permissions we let
    // the subsequent upload surface the real error.
  }
  return container;
}

export type UploadResult = {
  containerName: string;
  blobPath: string;
  url: string;
};

export async function uploadBuffer(
  containerName: string,
  blobPath: string,
  buffer: Buffer,
  contentType: string,
): Promise<UploadResult> {
  const container = await getOrCreateContainer(containerName);
  const block = container.getBlockBlobClient(blobPath);
  await block.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
  return {
    containerName,
    blobPath,
    url: block.url,
  };
}

/** New layout uses Org_{uuid}/… prefixes inside the primary container. */
export function isNewLayoutBlobPath(blobPath: string): boolean {
  return blobPath.startsWith("Org_");
}

export function resolveSignatureDownloadContainer(
  blobPath: string,
  storedContainer: string | null | undefined,
): string {
  if (storedContainer) return storedContainer;
  if (isNewLayoutBlobPath(blobPath)) return env.AZURE_BLOB_CONTAINER;
  return env.AZURE_BLOB_CONTAINER_SIGNATURES;
}

export function resolveAgreementPdfDownloadContainer(
  blobPath: string,
  storedContainer: string | null | undefined,
): string {
  if (storedContainer) return storedContainer;
  if (isNewLayoutBlobPath(blobPath)) return env.AZURE_BLOB_CONTAINER;
  return env.AZURE_BLOB_CONTAINER_AGREEMENTS;
}

function orgProjectPrefix(organizationId: string, projectId: string): string {
  return `Org_${organizationId}/Project_${projectId}`;
}

function orgClientPrefix(organizationId: string, clientId: string): string {
  return `Org_${organizationId}/Client_${clientId}`;
}

export async function uploadServiceProviderSignaturePng(
  organizationId: string,
  projectId: string,
  agreementId: string,
  buffer: Buffer,
): Promise<UploadResult> {
  const ts = Date.now();
  const blobPath = `${orgProjectPrefix(organizationId, projectId)}/Signatures/sp-${agreementId}-${ts}.png`;
  return uploadBuffer(env.AZURE_BLOB_CONTAINER, blobPath, buffer, "image/png");
}

export async function uploadClientSignaturePng(
  organizationId: string,
  clientId: string,
  agreementId: string,
  buffer: Buffer,
): Promise<UploadResult> {
  const ts = Date.now();
  const blobPath = `${orgClientPrefix(organizationId, clientId)}/Signatures/client-${agreementId}-${ts}.png`;
  return uploadBuffer(env.AZURE_BLOB_CONTAINER, blobPath, buffer, "image/png");
}

export async function uploadAgreementPdfToProject(
  organizationId: string,
  projectId: string,
  agreementId: string,
  buffer: Buffer,
): Promise<UploadResult> {
  const ts = Date.now();
  const blobPath = `${orgProjectPrefix(organizationId, projectId)}/Agreements/agreement-${agreementId}-${ts}.pdf`;
  return uploadBuffer(env.AZURE_BLOB_CONTAINER, blobPath, buffer, "application/pdf");
}

/** Generic upload under project Agreements folder (e.g. CRUD "other" files). */
export async function uploadProjectAgreementFolderFile(
  organizationId: string,
  projectId: string,
  safeFilename: string,
  buffer: Buffer,
  contentType: string,
): Promise<UploadResult> {
  const ts = Date.now();
  const blobPath = `${orgProjectPrefix(organizationId, projectId)}/Agreements/${ts}-${safeFilename}`;
  return uploadBuffer(env.AZURE_BLOB_CONTAINER, blobPath, buffer, contentType);
}

/** Generic upload under client Agreements folder. */
export async function uploadClientAgreementFolderFile(
  organizationId: string,
  clientId: string,
  safeFilename: string,
  buffer: Buffer,
  contentType: string,
): Promise<UploadResult> {
  const ts = Date.now();
  const blobPath = `${orgClientPrefix(organizationId, clientId)}/Agreements/${ts}-${safeFilename}`;
  return uploadBuffer(env.AZURE_BLOB_CONTAINER, blobPath, buffer, contentType);
}

export async function deleteBlob(
  containerName: string,
  blobPath: string,
): Promise<void> {
  if (!blobPath) return;
  const client = getClient();
  const container = client.getContainerClient(containerName);
  const block = container.getBlockBlobClient(blobPath);
  try {
    await block.deleteIfExists();
  } catch {
    // best-effort
  }
}

export async function getFileUrl(
  containerName: string,
  blobPath: string,
  options: { expiresInMinutes?: number } = {},
): Promise<string> {
  if (!blobPath) {
    throw new HttpError(404, "Blob path is required.");
  }
  const client = getClient();
  if (!cachedCredential) {
    return client.getContainerClient(containerName).getBlockBlobClient(blobPath).url;
  }
  const expiresInMinutes = options.expiresInMinutes ?? 60;
  const startsOn = new Date(Date.now() - 60 * 1000);
  const expiresOn = new Date(Date.now() + expiresInMinutes * 60 * 1000);
  const sas = generateBlobSASQueryParameters(
    {
      containerName,
      blobName: blobPath,
      permissions: BlobSASPermissions.parse("r"),
      startsOn,
      expiresOn,
      protocol: undefined,
    },
    cachedCredential,
  ).toString();
  const blob = client.getContainerClient(containerName).getBlockBlobClient(blobPath);
  return `${blob.url}?${sas}`;
}

export async function downloadBlobBuffer(
  containerName: string,
  blobPath: string,
): Promise<Buffer> {
  const client = getClient();
  const block = client.getContainerClient(containerName).getBlockBlobClient(blobPath);
  const buffer = await block.downloadToBuffer();
  return buffer;
}

/** Expense receipt uploads (organization-scoped folder segment). */
export function expenseAttachmentBlobPath(organizationId: string, fileName: string): string {
  return `Expense/Uploaded_Documents/${organizationId}/${fileName}`;
}

/** Client-generated expense PDFs (vendor-scoped). */
export function expenseGeneratedPdfBlobPath(
  organizationId: string,
  vendorId: string,
  fileName: string,
): string {
  return `Organization/${organizationId}/Vendor/${vendorId}/Pdfs/bill uploads/${fileName}`;
}

/** Pre–vendor-scoped layout: generated PDFs under organization only. */
export function legacyExpenseGeneratedPdfBlobPath(organizationId: string, fileName: string): string {
  return `Expense/Generated_pdfs/${organizationId}/${fileName}`;
}

export function isAzureConfigured(): boolean {
  return Boolean(env.AZURE_STORAGE_CONNECTION_STRING);
}

/** Scoped folder for agency internal chat uploads (inside primary container). */
export function internalChatBlobPath(organizationId: string, storedFileName: string): string {
  return `Org_${organizationId}/chat/${storedFileName}`;
}

export async function getBlobUploadSasUrl(
  containerName: string,
  blobPath: string,
  options: { expiresInMinutes?: number } = {},
): Promise<{ sasUrl: string; expiresAt: string }> {
  const client = getClient();
  if (!cachedCredential) {
    throw new HttpError(
      500,
      "Writable SAS URLs require AZURE_STORAGE_CONNECTION_STRING account key credential.",
    );
  }
  const expiresInMinutes = options.expiresInMinutes ?? 15;
  const startsOn = new Date(Date.now() - 60 * 1000);
  const expiresOn = new Date(Date.now() + expiresInMinutes * 60 * 1000);
  const perms = new BlobSASPermissions();
  perms.write = true;
  perms.create = true;

  const sas = generateBlobSASQueryParameters(
    {
      containerName,
      blobName: blobPath,
      permissions: perms,
      startsOn,
      expiresOn,
    },
    cachedCredential,
  ).toString();
  await getOrCreateContainer(containerName);
  const blobUrl = client.getContainerClient(containerName).getBlockBlobClient(blobPath).url;
  return { sasUrl: `${blobUrl}?${sas}`, expiresAt: expiresOn.toISOString() };
}

export async function getBlobContentProperties(
  containerName: string,
  blobPath: string,
): Promise<{ contentLength: number | undefined; contentType: string | undefined } | null> {
  const client = getClient();
  const block = client.getContainerClient(containerName).getBlockBlobClient(blobPath);
  try {
    const props = await block.getProperties();
    return {
      contentLength: props.contentLength,
      contentType: props.contentType,
    };
  } catch {
    return null;
  }
}
