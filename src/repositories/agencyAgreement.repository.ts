import type { Pool, PoolClient } from "pg";

import type {
  AgreementDeliverableRow,
  AgreementDurationUnit,
  AgreementMilestoneRow,
  AgreementMilestoneStatus,
  AgreementPaymentStructure,
  AgreementPaymentTermRow,
  AgreementRow,
  AgreementSignatureRow,
  AgreementSignerType,
  AgreementStatus,
} from "../types/agencyAgreement.js";

type Executor = Pool | PoolClient;

const AGREEMENT_COLUMNS = `
  id,
  organization_id,
  project_id,
  service_provider_name,
  agreement_date,
  service_type,
  start_date,
  end_date,
  duration,
  duration_unit,
  number_of_revisions,
  jurisdiction,
  status,
  document_id,
  final_pdf_blob_path,
  final_pdf_blob_container,
  final_pdf_byte_size,
  final_pdf_content_type,
  final_pdf_uploaded_at,
  created_by_org_user_id,
  created_at,
  updated_at,
  deleted_at
`;

export type InsertAgreementParams = {
  organizationId: string;
  projectId: string;
  createdByOrgUserId: string | null;
  serviceProviderName: string;
  agreementDate: string;
  serviceType: string;
  startDate: string | null;
  endDate: string | null;
  duration: number | null;
  durationUnit: AgreementDurationUnit | null;
  numberOfRevisions: number;
  jurisdiction: string | null;
};

export async function insertAgreement(
  exec: Executor,
  params: InsertAgreementParams,
): Promise<AgreementRow> {
  const result = await exec.query<AgreementRow>(
    `
      INSERT INTO agency_agreements (
        organization_id, project_id, created_by_org_user_id,
        service_provider_name, agreement_date, service_type,
        start_date, end_date, duration, duration_unit,
        number_of_revisions, jurisdiction, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft')
      RETURNING ${AGREEMENT_COLUMNS};
    `,
    [
      params.organizationId,
      params.projectId,
      params.createdByOrgUserId,
      params.serviceProviderName,
      params.agreementDate,
      params.serviceType,
      params.startDate,
      params.endDate,
      params.duration,
      params.durationUnit,
      params.numberOfRevisions,
      params.jurisdiction,
    ],
  );
  return result.rows[0];
}

export async function findAgreementById(
  exec: Executor,
  organizationId: string,
  id: string,
): Promise<AgreementRow | null> {
  const result = await exec.query<AgreementRow>(
    `
      SELECT ${AGREEMENT_COLUMNS}
      FROM agency_agreements
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      LIMIT 1;
    `,
    [id, organizationId],
  );
  return result.rows[0] ?? null;
}

export async function findAgreementByProjectId(
  exec: Executor,
  organizationId: string,
  projectId: string,
): Promise<AgreementRow | null> {
  const result = await exec.query<AgreementRow>(
    `
      SELECT ${AGREEMENT_COLUMNS}
      FROM agency_agreements
      WHERE project_id = $1 AND organization_id = $2 AND deleted_at IS NULL
      LIMIT 1;
    `,
    [projectId, organizationId],
  );
  return result.rows[0] ?? null;
}

export async function findAgreementByIdAnyOrg(
  exec: Executor,
  id: string,
): Promise<AgreementRow | null> {
  const result = await exec.query<AgreementRow>(
    `
      SELECT ${AGREEMENT_COLUMNS}
      FROM agency_agreements
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1;
    `,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function updateAgreementDocumentId(
  exec: Executor,
  agreementId: string,
  documentId: string,
): Promise<void> {
  await exec.query(
    `UPDATE agency_agreements SET document_id = $1, updated_at = NOW() WHERE id = $2;`,
    [documentId, agreementId],
  );
}

export async function updateAgreementFinalPdf(
  exec: Executor,
  agreementId: string,
  params: {
    blobPath: string;
    blobContainer: string;
    byteSize: number;
    contentType: string;
  },
): Promise<void> {
  await exec.query(
    `
      UPDATE agency_agreements
      SET
        final_pdf_blob_path = $1,
        final_pdf_blob_container = $2,
        final_pdf_byte_size = $3,
        final_pdf_content_type = $4,
        final_pdf_uploaded_at = NOW(),
        updated_at = NOW()
      WHERE id = $5 AND deleted_at IS NULL;
    `,
    [
      params.blobPath,
      params.blobContainer,
      params.byteSize,
      params.contentType,
      agreementId,
    ],
  );
}

export type AgreementCorePatch = {
  service_provider_name?: string;
  agreement_date?: string;
  service_type?: string;
  start_date?: string | null;
  end_date?: string | null;
  duration?: number | null;
  duration_unit?: AgreementDurationUnit | null;
  number_of_revisions?: number;
  jurisdiction?: string | null;
  status?: AgreementStatus;
};

export async function updateAgreementCore(
  exec: Executor,
  organizationId: string,
  id: string,
  patch: AgreementCorePatch,
): Promise<AgreementRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  (Object.keys(patch) as Array<keyof AgreementCorePatch>).forEach((key) => {
    const value = patch[key];
    if (value === undefined) return;
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  });
  if (sets.length === 0) return findAgreementById(exec, organizationId, id);
  sets.push("updated_at = NOW()");
  params.push(id);
  const idParam = `$${params.length}`;
  params.push(organizationId);
  const orgParam = `$${params.length}`;
  const result = await exec.query<AgreementRow>(
    `
      UPDATE agency_agreements
      SET ${sets.join(", ")}
      WHERE id = ${idParam} AND organization_id = ${orgParam} AND deleted_at IS NULL
      RETURNING ${AGREEMENT_COLUMNS};
    `,
    params,
  );
  return result.rows[0] ?? null;
}

export async function setAgreementStatus(
  exec: Executor,
  agreementId: string,
  status: AgreementStatus,
): Promise<void> {
  await exec.query(
    `UPDATE agency_agreements SET status = $1, updated_at = NOW() WHERE id = $2;`,
    [status, agreementId],
  );
}

export async function softDeleteAgreement(
  exec: Executor,
  organizationId: string,
  id: string,
): Promise<boolean> {
  const result = await exec.query(
    `
      UPDATE agency_agreements
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL;
    `,
    [id, organizationId],
  );
  return (result.rowCount ?? 0) > 0;
}

// Deliverables -------------------------------------------------------------

export async function deleteDeliverables(
  exec: Executor,
  agreementId: string,
): Promise<void> {
  await exec.query(
    `DELETE FROM agency_agreement_deliverables WHERE agreement_id = $1;`,
    [agreementId],
  );
}

export async function insertDeliverables(
  exec: Executor,
  agreementId: string,
  items: Array<{ description: string }>,
): Promise<AgreementDeliverableRow[]> {
  if (items.length === 0) return [];
  const rows: AgreementDeliverableRow[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const r = await exec.query<AgreementDeliverableRow>(
      `
        INSERT INTO agency_agreement_deliverables (agreement_id, description, sort_order)
        VALUES ($1, $2, $3)
        RETURNING id, agreement_id, description, sort_order;
      `,
      [agreementId, item.description, i],
    );
    rows.push(r.rows[0]);
  }
  return rows;
}

export async function listDeliverables(
  exec: Executor,
  agreementId: string,
): Promise<AgreementDeliverableRow[]> {
  const result = await exec.query<AgreementDeliverableRow>(
    `
      SELECT id, agreement_id, description, sort_order
      FROM agency_agreement_deliverables
      WHERE agreement_id = $1
      ORDER BY sort_order ASC;
    `,
    [agreementId],
  );
  return result.rows;
}

// Payment terms + milestones ----------------------------------------------

export async function deletePaymentTerms(
  exec: Executor,
  agreementId: string,
): Promise<void> {
  await exec.query(
    `DELETE FROM agency_agreement_payment_terms WHERE agreement_id = $1;`,
    [agreementId],
  );
}

export async function insertPaymentTerms(
  exec: Executor,
  agreementId: string,
  paymentStructure: AgreementPaymentStructure,
  paymentMethod: string | null,
): Promise<AgreementPaymentTermRow> {
  const result = await exec.query<AgreementPaymentTermRow>(
    `
      INSERT INTO agency_agreement_payment_terms (
        agreement_id, payment_structure, payment_method
      )
      VALUES ($1, $2, $3)
      RETURNING id, agreement_id, payment_structure, payment_method;
    `,
    [agreementId, paymentStructure, paymentMethod],
  );
  return result.rows[0];
}

export async function findPaymentTermsByAgreement(
  exec: Executor,
  agreementId: string,
): Promise<AgreementPaymentTermRow | null> {
  const result = await exec.query<AgreementPaymentTermRow>(
    `
      SELECT id, agreement_id, payment_structure, payment_method
      FROM agency_agreement_payment_terms
      WHERE agreement_id = $1
      LIMIT 1;
    `,
    [agreementId],
  );
  return result.rows[0] ?? null;
}

export async function insertMilestones(
  exec: Executor,
  paymentTermId: string,
  items: Array<{ description: string; amount: number; date: string | null }>,
): Promise<AgreementMilestoneRow[]> {
  if (items.length === 0) return [];
  const rows: AgreementMilestoneRow[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const r = await exec.query<AgreementMilestoneRow>(
      `
        INSERT INTO agency_agreement_payment_milestones (
          agreement_payment_term_id, description, amount, sort_order, milestone_date, status
        )
        VALUES ($1, $2, $3, $4, $5, 'pending')
        RETURNING
          id,
          agreement_payment_term_id,
          description,
          amount,
          sort_order,
          TO_CHAR(milestone_date, 'YYYY-MM-DD') AS milestone_date_str,
          status;
      `,
      [paymentTermId, item.description, item.amount, i, item.date],
    );
    rows.push(r.rows[0]);
  }
  return rows;
}

export async function listMilestonesByAgreement(
  exec: Executor,
  agreementId: string,
): Promise<AgreementMilestoneRow[]> {
  const result = await exec.query<AgreementMilestoneRow>(
    `
      SELECT
        m.id,
        m.agreement_payment_term_id,
        m.description,
        m.amount,
        m.sort_order,
        TO_CHAR(m.milestone_date, 'YYYY-MM-DD') AS milestone_date_str,
        m.status
      FROM agency_agreement_payment_milestones m
      INNER JOIN agency_agreement_payment_terms t ON t.id = m.agreement_payment_term_id
      WHERE t.agreement_id = $1
      ORDER BY m.sort_order ASC;
    `,
    [agreementId],
  );
  return result.rows;
}

// Signatures --------------------------------------------------------------

export async function insertSignature(
  exec: Executor,
  params: {
    agreementId: string;
    signerType: AgreementSignerType;
    clientId: string | null;
    signerName: string;
    signatureImageName: string | null;
    signatureImagePath: string | null;
    blobContainer: string | null;
    ipAddress: string | null;
    documentId: string | null;
  },
): Promise<AgreementSignatureRow> {
  const result = await exec.query<AgreementSignatureRow>(
    `
      INSERT INTO agency_agreement_signatures (
        agreement_id, signer_type, client_id, signer_name,
        signature_image_name, signature_image_path, blob_container, ip_address, document_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING
        id, agreement_id, signer_type, client_id, signer_name,
        signature_image_name, signature_image_path, blob_container, ip_address, document_id, signed_at;
    `,
    [
      params.agreementId,
      params.signerType,
      params.clientId,
      params.signerName,
      params.signatureImageName,
      params.signatureImagePath,
      params.blobContainer,
      params.ipAddress,
      params.documentId,
    ],
  );
  return result.rows[0];
}

export async function listSignaturesByAgreement(
  exec: Executor,
  agreementId: string,
): Promise<AgreementSignatureRow[]> {
  const result = await exec.query<AgreementSignatureRow>(
    `
      SELECT
        id, agreement_id, signer_type, client_id, signer_name,
        signature_image_name, signature_image_path, blob_container, ip_address, document_id, signed_at
      FROM agency_agreement_signatures
      WHERE agreement_id = $1
      ORDER BY signed_at ASC;
    `,
    [agreementId],
  );
  return result.rows;
}

export async function findClientSignature(
  exec: Executor,
  agreementId: string,
  clientId: string,
): Promise<AgreementSignatureRow | null> {
  const result = await exec.query<AgreementSignatureRow>(
    `
      SELECT
        id, agreement_id, signer_type, client_id, signer_name,
        signature_image_name, signature_image_path, blob_container, ip_address, document_id, signed_at
      FROM agency_agreement_signatures
      WHERE agreement_id = $1 AND signer_type = 'client' AND client_id = $2
      LIMIT 1;
    `,
    [agreementId, clientId],
  );
  return result.rows[0] ?? null;
}

export async function deleteSignatureById(
  exec: Executor,
  id: string,
): Promise<void> {
  await exec.query(
    `DELETE FROM agency_agreement_signatures WHERE id = $1;`,
    [id],
  );
}

export async function countSignaturesUsingBlobPath(
  exec: Executor,
  organizationId: string,
  blobPath: string,
): Promise<number> {
  const result = await exec.query<{ c: string }>(
    `
      SELECT COUNT(*)::text AS c
      FROM agency_agreement_signatures s
      INNER JOIN agency_agreements a ON a.id = s.agreement_id
      WHERE a.organization_id = $1 AND s.signature_image_path = $2;
    `,
    [organizationId, blobPath],
  );
  return Number(result.rows[0]?.c ?? 0);
}

export async function countAgreementsUsingFinalPdfPath(
  exec: Executor,
  organizationId: string,
  blobPath: string,
): Promise<number> {
  const result = await exec.query<{ c: string }>(
    `
      SELECT COUNT(*)::text AS c
      FROM agency_agreements
      WHERE organization_id = $1 AND final_pdf_blob_path = $2 AND deleted_at IS NULL;
    `,
    [organizationId, blobPath],
  );
  return Number(result.rows[0]?.c ?? 0);
}

/** Row shape for GET /agency/files list (signatures, PDFs, and project files merged in service). */
export type AgreementFileAssetRow = {
  composite_id: string;
  organization_id: string;
  file_kind: string;
  project_id: string | null;
  client_id: string | null;
  agreement_id: string | null;
  container_name: string | null;
  blob_path: string;
  original_filename: string | null;
  content_type: string | null;
  byte_size: string | null;
  created_at: Date;
};

export async function listSignatureBlobsAsAssets(
  exec: Executor,
  organizationId: string,
  filters: {
    projectId?: string;
    clientId?: string;
    fileKind?: "service_provider_signature" | "client_signature";
  },
): Promise<AgreementFileAssetRow[]> {
  const conditions = [
    "a.organization_id = $1",
    "a.deleted_at IS NULL",
    "s.signature_image_path IS NOT NULL",
  ];
  const params: unknown[] = [organizationId];
  let n = 1;

  if (filters.projectId) {
    n += 1;
    conditions.push(`a.project_id = $${n}`);
    params.push(filters.projectId);
  }
  if (filters.clientId) {
    n += 1;
    conditions.push(`s.client_id = $${n}`);
    params.push(filters.clientId);
  }
  if (filters.fileKind === "service_provider_signature") {
    conditions.push(`s.signer_type = 'service_provider'`);
  } else if (filters.fileKind === "client_signature") {
    conditions.push(`s.signer_type = 'client'`);
  }

  const result = await exec.query<AgreementFileAssetRow>(
    `
      SELECT
        ('sig:' || s.id::text) AS composite_id,
        a.organization_id,
        CASE
          WHEN s.signer_type = 'service_provider' THEN 'service_provider_signature'
          ELSE 'client_signature'
        END AS file_kind,
        a.project_id,
        s.client_id,
        a.id AS agreement_id,
        s.blob_container AS container_name,
        s.signature_image_path AS blob_path,
        s.signature_image_name AS original_filename,
        'image/png'::text AS content_type,
        NULL::bigint AS byte_size,
        s.signed_at AS created_at
      FROM agency_agreement_signatures s
      INNER JOIN agency_agreements a ON a.id = s.agreement_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY s.signed_at DESC;
    `,
    params,
  );
  return result.rows;
}

export async function listAgreementPdfAssets(
  exec: Executor,
  organizationId: string,
  filters: { projectId?: string },
): Promise<AgreementFileAssetRow[]> {
  const conditions = [
    "a.organization_id = $1",
    "a.deleted_at IS NULL",
    "a.final_pdf_blob_path IS NOT NULL",
  ];
  const params: unknown[] = [organizationId];
  let n = 1;
  if (filters.projectId) {
    n += 1;
    conditions.push(`a.project_id = $${n}`);
    params.push(filters.projectId);
  }
  const result = await exec.query<AgreementFileAssetRow>(
    `
      SELECT
        ('pdf:' || a.id::text) AS composite_id,
        a.organization_id,
        'agreement_pdf'::text AS file_kind,
        a.project_id,
        NULL::uuid AS client_id,
        a.id AS agreement_id,
        a.final_pdf_blob_container AS container_name,
        a.final_pdf_blob_path AS blob_path,
        ('agreement-' || a.id::text || '.pdf') AS original_filename,
        a.final_pdf_content_type AS content_type,
        a.final_pdf_byte_size AS byte_size,
        a.final_pdf_uploaded_at AS created_at
      FROM agency_agreements a
      WHERE ${conditions.join(" AND ")}
      ORDER BY a.final_pdf_uploaded_at DESC NULLS LAST;
    `,
    params,
  );
  return result.rows;
}

export async function findSignatureBlobAssetBySignatureId(
  exec: Executor,
  organizationId: string,
  signatureId: string,
): Promise<AgreementFileAssetRow | null> {
  const result = await exec.query<AgreementFileAssetRow>(
    `
      SELECT
        ('sig:' || s.id::text) AS composite_id,
        a.organization_id,
        CASE
          WHEN s.signer_type = 'service_provider' THEN 'service_provider_signature'
          ELSE 'client_signature'
        END AS file_kind,
        a.project_id,
        s.client_id,
        a.id AS agreement_id,
        s.blob_container AS container_name,
        s.signature_image_path AS blob_path,
        s.signature_image_name AS original_filename,
        'image/png'::text AS content_type,
        NULL::bigint AS byte_size,
        s.signed_at AS created_at
      FROM agency_agreement_signatures s
      INNER JOIN agency_agreements a ON a.id = s.agreement_id
      WHERE s.id = $1 AND a.organization_id = $2 AND a.deleted_at IS NULL
      LIMIT 1;
    `,
    [signatureId, organizationId],
  );
  return result.rows[0] ?? null;
}

export async function findAgreementPdfAssetByAgreementId(
  exec: Executor,
  organizationId: string,
  agreementId: string,
): Promise<AgreementFileAssetRow | null> {
  const result = await exec.query<AgreementFileAssetRow>(
    `
      SELECT
        ('pdf:' || a.id::text) AS composite_id,
        a.organization_id,
        'agreement_pdf'::text AS file_kind,
        a.project_id,
        NULL::uuid AS client_id,
        a.id AS agreement_id,
        a.final_pdf_blob_container AS container_name,
        a.final_pdf_blob_path AS blob_path,
        ('agreement-' || a.id::text || '.pdf') AS original_filename,
        a.final_pdf_content_type AS content_type,
        a.final_pdf_byte_size AS byte_size,
        a.final_pdf_uploaded_at AS created_at
      FROM agency_agreements a
      WHERE a.id = $1 AND a.organization_id = $2 AND a.deleted_at IS NULL
        AND a.final_pdf_blob_path IS NOT NULL
      LIMIT 1;
    `,
    [agreementId, organizationId],
  );
  return result.rows[0] ?? null;
}

export async function setMilestoneStatus(
  exec: Executor,
  milestoneId: string,
  status: AgreementMilestoneStatus,
): Promise<void> {
  await exec.query(
    `UPDATE agency_agreement_payment_milestones SET status = $1 WHERE id = $2;`,
    [status, milestoneId],
  );
}
