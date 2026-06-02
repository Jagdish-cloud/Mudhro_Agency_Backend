import type { Pool, PoolClient } from "pg";

type Executor = Pool | PoolClient;

export type AgencyProjectFileRow = {
  id: string;
  organization_id: string;
  project_id: string | null;
  client_id: string | null;
  agreement_id: string | null;
  container_name: string;
  blob_path: string;
  original_filename: string | null;
  content_type: string | null;
  byte_size: string | null;
  created_at: Date;
  deleted_at: Date | null;
};

const ROW_SELECT = `
  id,
  organization_id,
  project_id,
  client_id,
  agreement_id,
  container_name,
  blob_path,
  original_filename,
  content_type,
  byte_size,
  created_at,
  deleted_at
`;

export type InsertAgencyProjectFileParams = {
  organizationId: string;
  projectId: string | null;
  clientId: string | null;
  agreementId: string | null;
  containerName: string;
  blobPath: string;
  originalFilename: string | null;
  contentType: string | null;
  byteSize: number | null;
};

export async function insertAgencyProjectFile(
  exec: Executor,
  params: InsertAgencyProjectFileParams,
): Promise<AgencyProjectFileRow> {
  const result = await exec.query<AgencyProjectFileRow>(
    `
      INSERT INTO agency_project_files (
        organization_id, project_id, client_id, agreement_id,
        container_name, blob_path, original_filename, content_type, byte_size
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING ${ROW_SELECT};
    `,
    [
      params.organizationId,
      params.projectId,
      params.clientId,
      params.agreementId,
      params.containerName,
      params.blobPath,
      params.originalFilename,
      params.contentType,
      params.byteSize,
    ],
  );
  return result.rows[0];
}

export async function findAgencyProjectFileById(
  exec: Executor,
  organizationId: string,
  id: string,
): Promise<AgencyProjectFileRow | null> {
  const result = await exec.query<AgencyProjectFileRow>(
    `
      SELECT ${ROW_SELECT}
      FROM agency_project_files
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      LIMIT 1;
    `,
    [id, organizationId],
  );
  return result.rows[0] ?? null;
}

export type ListAgencyProjectFilesQuery = {
  projectId?: string | null;
  clientId?: string | null;
  limit: number;
  offset: number;
};

export async function listAgencyProjectFiles(
  exec: Executor,
  organizationId: string,
  query: ListAgencyProjectFilesQuery,
): Promise<{ rows: AgencyProjectFileRow[]; total: number }> {
  const conditions: string[] = [
    "organization_id = $1",
    "deleted_at IS NULL",
  ];
  const params: unknown[] = [organizationId];
  let n = 1;

  if (query.projectId) {
    n += 1;
    conditions.push(`project_id = $${n}`);
    params.push(query.projectId);
  }
  if (query.clientId) {
    n += 1;
    conditions.push(`client_id = $${n}`);
    params.push(query.clientId);
  }

  const where = conditions.join(" AND ");

  const countResult = await exec.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM agency_project_files WHERE ${where};`,
    params,
  );
  const total = Number(countResult.rows[0]?.c ?? 0);

  n += 1;
  const limitParam = n;
  params.push(query.limit);
  n += 1;
  const offsetParam = n;
  params.push(query.offset);

  const listResult = await exec.query<AgencyProjectFileRow>(
    `
      SELECT ${ROW_SELECT}
      FROM agency_project_files
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT $${limitParam} OFFSET $${offsetParam};
    `,
    params,
  );

  return { rows: listResult.rows, total };
}

export async function updateAgencyProjectFileOriginalName(
  exec: Executor,
  organizationId: string,
  id: string,
  originalFilename: string | null,
): Promise<AgencyProjectFileRow | null> {
  const result = await exec.query<AgencyProjectFileRow>(
    `
      UPDATE agency_project_files
      SET original_filename = $3
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      RETURNING ${ROW_SELECT};
    `,
    [id, organizationId, originalFilename],
  );
  return result.rows[0] ?? null;
}

export async function softDeleteAgencyProjectFile(
  exec: Executor,
  organizationId: string,
  id: string,
): Promise<AgencyProjectFileRow | null> {
  const result = await exec.query<AgencyProjectFileRow>(
    `
      UPDATE agency_project_files
      SET deleted_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      RETURNING ${ROW_SELECT};
    `,
    [id, organizationId],
  );
  return result.rows[0] ?? null;
}
