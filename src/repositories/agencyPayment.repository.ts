import type { Pool, PoolClient } from "pg";

import type {
  AgencyPaymentMethod,
  AgencyPaymentRow,
} from "../types/agencyInvoice.js";

type Executor = Pool | PoolClient;

const PAYMENT_COLUMNS = `
  id, invoice_id, organization_id, installment_id, amount,
  payment_gateway_fee, tds_deducted, other_deduction, settlement_reference_amount,
  method, reference,
  received_at, notes, recorded_by_org_user_id, created_at
`;

export type InsertPaymentParams = {
  invoiceId: string;
  organizationId: string;
  installmentId: string | null;
  amount: number;
  paymentGatewayFee: number;
  tdsDeducted: number;
  otherDeduction: number;
  settlementReferenceAmount: number | null;
  method: AgencyPaymentMethod;
  reference: string | null;
  receivedAt: Date;
  notes: string | null;
  recordedByOrgUserId: string;
};

export async function insertPayment(
  exec: Executor,
  params: InsertPaymentParams,
): Promise<AgencyPaymentRow> {
  const result = await exec.query<AgencyPaymentRow>(
    `
      INSERT INTO agency_invoice_payments (
        invoice_id, organization_id, installment_id, amount,
        payment_gateway_fee, tds_deducted, other_deduction, settlement_reference_amount,
        method, reference,
        received_at, notes, recorded_by_org_user_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING ${PAYMENT_COLUMNS};
    `,
    [
      params.invoiceId,
      params.organizationId,
      params.installmentId,
      params.amount,
      params.paymentGatewayFee,
      params.tdsDeducted,
      params.otherDeduction,
      params.settlementReferenceAmount,
      params.method,
      params.reference,
      params.receivedAt,
      params.notes,
      params.recordedByOrgUserId,
    ],
  );
  return result.rows[0];
}

export async function listPaymentsByInvoice(
  exec: Executor,
  organizationId: string,
  invoiceId: string,
): Promise<AgencyPaymentRow[]> {
  const result = await exec.query<AgencyPaymentRow>(
    `
      SELECT ${PAYMENT_COLUMNS}
      FROM agency_invoice_payments
      WHERE invoice_id = $1 AND organization_id = $2
      ORDER BY received_at DESC, created_at DESC;
    `,
    [invoiceId, organizationId],
  );
  return result.rows;
}

export async function sumPaymentsByInvoice(
  exec: Executor,
  organizationId: string,
  invoiceId: string,
): Promise<number> {
  const result = await exec.query<{ total: string | null }>(
    `
      SELECT COALESCE(SUM(amount), 0)::text AS total
      FROM agency_invoice_payments
      WHERE invoice_id = $1 AND organization_id = $2;
    `,
    [invoiceId, organizationId],
  );
  return Number(result.rows[0]?.total ?? 0);
}

export async function sumPaymentDeductionsByInvoice(
  exec: Executor,
  organizationId: string,
  invoiceId: string,
): Promise<number> {
  const result = await exec.query<{ total: string | null }>(
    `
      SELECT COALESCE(SUM(
        COALESCE(payment_gateway_fee, 0)
        + COALESCE(tds_deducted, 0)
        + COALESCE(other_deduction, 0)
      ), 0)::text AS total
      FROM agency_invoice_payments
      WHERE invoice_id = $1 AND organization_id = $2;
    `,
    [invoiceId, organizationId],
  );
  return Number(result.rows[0]?.total ?? 0);
}

export async function sumPaymentsByInstallment(
  exec: Executor,
  organizationId: string,
  installmentId: string,
): Promise<number> {
  const result = await exec.query<{ total: string | null }>(
    `
      SELECT COALESCE(SUM(amount), 0)::text AS total
      FROM agency_invoice_payments
      WHERE installment_id = $1 AND organization_id = $2;
    `,
    [installmentId, organizationId],
  );
  return Number(result.rows[0]?.total ?? 0);
}
