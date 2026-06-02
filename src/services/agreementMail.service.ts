import crypto from "crypto";

import { pool } from "../db/pool.js";
import {
  findAgencyClientById,
} from "../repositories/agencyClient.repository.js";
import {
  findAgreementById,
  setAgreementStatus,
} from "../repositories/agencyAgreement.repository.js";
import {
  upsertClientLink,
} from "../repositories/agreementClientLink.repository.js";
import { findAgencyProjectById } from "../repositories/agencyProject.repository.js";
import { HttpError } from "../utils/httpError.js";
import { buildAgreementEmail } from "../utils/emailTemplates.js";
import {
  AGREEMENT_EDIT_WINDOW_MS,
  getAgreementSignBaseUrl,
} from "./agencyAgreement.service.js";
import { sendMail } from "./mail.service.js";

export type SendAgreementResult = {
  agreementId: string;
  results: Array<{
    clientId: string;
    delivered: boolean;
    error?: string;
  }>;
};

export type SenderProfile = {
  fullName: string;
  email: string;
  phone?: string | null;
};

async function loadSenderProfile(
  organizationId: string,
  orgUserId: string,
): Promise<SenderProfile> {
  const result = await pool.query<{ name: string; email: string; number: string }>(
    `
      SELECT name, email, number
      FROM organization_admins
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      LIMIT 1;
    `,
    [orgUserId, organizationId],
  );
  const row = result.rows[0];
  if (!row) {
    return { fullName: "Mudhro Agency", email: "no-reply@mudhro.local" };
  }
  return { fullName: row.name, email: row.email, phone: row.number || null };
}

async function loadProjectName(
  organizationId: string,
  projectId: string,
): Promise<string | undefined> {
  const project = await findAgencyProjectById(pool, organizationId, projectId);
  return project?.name;
}

/**
 * Generate per-client signing tokens, persist them, and send out the email
 * for each. Failures are isolated per recipient -- the caller still receives
 * the agreement id and the per-client status array.
 */
export async function sendAgreementToClients(
  organizationId: string,
  orgUserId: string,
  agreementId: string,
  clientIds: string[],
  req?: { protocol: string; get(name: string): string | undefined },
): Promise<SendAgreementResult> {
  const agreement = await findAgreementById(pool, organizationId, agreementId);
  if (!agreement) throw new HttpError(404, "Agreement not found.");

  // The "send window" mirrors the edit window: 2 days from agreement creation.
  if (Date.now() - agreement.created_at.getTime() > AGREEMENT_EDIT_WINDOW_MS) {
    throw new HttpError(
      400,
      "This agreement can no longer be sent; the 2-day window has expired.",
    );
  }

  const sender = await loadSenderProfile(organizationId, orgUserId);
  const projectName = await loadProjectName(organizationId, agreement.project_id);
  const baseUrl = getAgreementSignBaseUrl(req);
  const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

  const results: SendAgreementResult["results"] = [];

  for (const clientId of clientIds) {
    try {
      const client = await findAgencyClientById(pool, organizationId, clientId);
      if (!client) {
        results.push({
          clientId,
          delivered: false,
          error: "Client not found in this organization.",
        });
        continue;
      }
      if (!client.email || !client.email.includes("@")) {
        results.push({
          clientId,
          delivered: false,
          error: "Client has no valid email on file.",
        });
        continue;
      }

      const token = crypto.randomBytes(32).toString("hex");
      await upsertClientLink(pool, {
        agreementId: agreement.id,
        clientId,
        token,
        expiresAt,
      });

      const link = `${baseUrl}/agreement/sign/${token}`;
      const message = buildAgreementEmail({
        clientFullName: client.contact_name || client.name,
        userFullName: sender.fullName,
        userPhone: sender.phone ?? undefined,
        userEmail: sender.email,
        agreementLink: link,
        projectName,
      });

      const sendResult = await sendMail({
        to: client.email,
        subject: message.subject,
        text: message.text,
        html: message.html,
        replyTo: sender.email,
      });

      results.push({
        clientId,
        delivered: sendResult.delivered,
        error: sendResult.error,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      results.push({ clientId, delivered: false, error: msg });
    }
  }

  // After the loop, regardless of partial failures, the agreement is now in
  // "pending" state (at least one signing link exists / was attempted).
  await setAgreementStatus(pool, agreement.id, "pending");

  return { agreementId: agreement.id, results };
}
