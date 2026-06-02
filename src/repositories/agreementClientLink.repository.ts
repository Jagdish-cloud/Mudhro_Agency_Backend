import type { Pool, PoolClient } from "pg";

import type {
  AgreementClientLinkRow,
  AgreementClientLinkStatus,
} from "../types/agencyAgreement.js";

type Executor = Pool | PoolClient;

const LINK_COLUMNS = `
  id,
  agreement_id,
  client_id,
  token,
  expires_at,
  status,
  email_sent_at,
  signed_at,
  created_at,
  updated_at
`;

/**
 * Upsert (replace) a per-client signing link. Each call regenerates the token
 * and resets the expiry; the row's status returns to 'pending' so the link
 * can be resent.
 */
export async function upsertClientLink(
  exec: Executor,
  params: {
    agreementId: string;
    clientId: string;
    token: string;
    expiresAt: Date;
  },
): Promise<AgreementClientLinkRow> {
  const result = await exec.query<AgreementClientLinkRow>(
    `
      INSERT INTO agency_agreement_client_links (
        agreement_id, client_id, token, expires_at, status, email_sent_at
      )
      VALUES ($1, $2, $3, $4, 'pending', NOW())
      ON CONFLICT (agreement_id, client_id)
      DO UPDATE SET
        token = EXCLUDED.token,
        expires_at = EXCLUDED.expires_at,
        status = 'pending',
        signed_at = NULL,
        email_sent_at = NOW(),
        updated_at = NOW()
      RETURNING ${LINK_COLUMNS};
    `,
    [params.agreementId, params.clientId, params.token, params.expiresAt],
  );
  return result.rows[0];
}

export async function findLinkByToken(
  exec: Executor,
  token: string,
): Promise<AgreementClientLinkRow | null> {
  const result = await exec.query<AgreementClientLinkRow>(
    `
      SELECT ${LINK_COLUMNS}
      FROM agency_agreement_client_links
      WHERE token = $1
      LIMIT 1;
    `,
    [token],
  );
  return result.rows[0] ?? null;
}

export async function listLinksByAgreement(
  exec: Executor,
  agreementId: string,
): Promise<AgreementClientLinkRow[]> {
  const result = await exec.query<AgreementClientLinkRow>(
    `
      SELECT ${LINK_COLUMNS}
      FROM agency_agreement_client_links
      WHERE agreement_id = $1
      ORDER BY created_at ASC;
    `,
    [agreementId],
  );
  return result.rows;
}

export async function markLinkSigned(
  exec: Executor,
  token: string,
): Promise<void> {
  await exec.query(
    `
      UPDATE agency_agreement_client_links
      SET status = 'client_signed', signed_at = NOW(), updated_at = NOW()
      WHERE token = $1;
    `,
    [token],
  );
}

export async function setLinkStatus(
  exec: Executor,
  id: string,
  status: AgreementClientLinkStatus,
): Promise<void> {
  await exec.query(
    `
      UPDATE agency_agreement_client_links
      SET status = $1, updated_at = NOW()
      WHERE id = $2;
    `,
    [status, id],
  );
}

export async function countSignedLinksForAgreement(
  exec: Executor,
  agreementId: string,
): Promise<{ signed: number; total: number }> {
  const result = await exec.query<{ signed: string; total: string }>(
    `
      SELECT
        COUNT(*) FILTER (WHERE status = 'client_signed')::text AS signed,
        COUNT(*)::text AS total
      FROM agency_agreement_client_links
      WHERE agreement_id = $1;
    `,
    [agreementId],
  );
  const row = result.rows[0];
  return {
    signed: Number(row?.signed ?? 0),
    total: Number(row?.total ?? 0),
  };
}
