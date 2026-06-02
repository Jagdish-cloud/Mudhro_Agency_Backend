import type { Pool, PoolClient } from "pg";

import type { AgencyAttachmentRow } from "../types/agencyInvoice.js";

type Executor = Pool | PoolClient;

const ATTACHMENT_COLUMNS = `
  id, invoice_id, organization_id, filename, mime_type, size_bytes, storage_path,
  uploaded_by_org_user_id, created_at
`;

export type InsertAttachmentParams = {
  invoiceId: string;
  organizationId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  uploadedByOrgUserId: string;
};

export async function insertAttachment(
  exec: Executor,
  params: InsertAttachmentParams,
): Promise<AgencyAttachmentRow> {
  const result = await exec.query<AgencyAttachmentRow>(
    `
      INSERT INTO agency_invoice_attachments
        (invoice_id, organization_id, filename, mime_type, size_bytes,
         storage_path, uploaded_by_org_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING ${ATTACHMENT_COLUMNS};
    `,
    [
      params.invoiceId,
      params.organizationId,
      params.filename,
      params.mimeType,
      params.sizeBytes,
      params.storagePath,
      params.uploadedByOrgUserId,
    ],
  );
  return result.rows[0];
}

export async function listAttachmentsByInvoice(
  exec: Executor,
  organizationId: string,
  invoiceId: string,
): Promise<AgencyAttachmentRow[]> {
  const result = await exec.query<AgencyAttachmentRow>(
    `
      SELECT ${ATTACHMENT_COLUMNS}
      FROM agency_invoice_attachments
      WHERE invoice_id = $1 AND organization_id = $2
      ORDER BY created_at DESC;
    `,
    [invoiceId, organizationId],
  );
  return result.rows;
}

export async function findAttachmentById(
  exec: Executor,
  organizationId: string,
  id: string,
): Promise<AgencyAttachmentRow | null> {
  const result = await exec.query<AgencyAttachmentRow>(
    `
      SELECT ${ATTACHMENT_COLUMNS}
      FROM agency_invoice_attachments
      WHERE id = $1 AND organization_id = $2
      LIMIT 1;
    `,
    [id, organizationId],
  );
  return result.rows[0] ?? null;
}

export async function deleteAttachment(
  exec: Executor,
  organizationId: string,
  id: string,
): Promise<boolean> {
  const result = await exec.query(
    `
      DELETE FROM agency_invoice_attachments
      WHERE id = $1 AND organization_id = $2;
    `,
    [id, organizationId],
  );
  return (result.rowCount ?? 0) > 0;
}
