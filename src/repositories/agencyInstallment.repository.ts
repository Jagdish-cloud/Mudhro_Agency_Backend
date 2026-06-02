import type { Pool, PoolClient } from "pg";

import type {
  AgencyInstallmentRow,
  AgencyInstallmentStatus,
} from "../types/agencyInvoice.js";

type Executor = Pool | PoolClient;

const INSTALLMENT_COLUMNS = `
  id, invoice_id, organization_id, sequence, due_date, amount, status, paid_at,
  created_at, updated_at
`;

export type InsertInstallmentParams = {
  invoiceId: string;
  organizationId: string;
  sequence: number;
  dueDate: string;
  amount: number;
};

export async function insertInstallments(
  exec: Executor,
  items: InsertInstallmentParams[],
): Promise<AgencyInstallmentRow[]> {
  if (items.length === 0) return [];
  const values: string[] = [];
  const params: unknown[] = [];
  items.forEach((it) => {
    const b = params.length;
    values.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5})`);
    params.push(it.invoiceId, it.organizationId, it.sequence, it.dueDate, it.amount);
  });

  const result = await exec.query<AgencyInstallmentRow>(
    `
      INSERT INTO agency_invoice_installments
        (invoice_id, organization_id, sequence, due_date, amount)
      VALUES ${values.join(", ")}
      RETURNING ${INSTALLMENT_COLUMNS};
    `,
    params,
  );
  return result.rows;
}

export async function listInstallmentsByInvoice(
  exec: Executor,
  organizationId: string,
  invoiceId: string,
): Promise<AgencyInstallmentRow[]> {
  const result = await exec.query<AgencyInstallmentRow>(
    `
      SELECT ${INSTALLMENT_COLUMNS}
      FROM agency_invoice_installments
      WHERE invoice_id = $1 AND organization_id = $2
      ORDER BY sequence ASC;
    `,
    [invoiceId, organizationId],
  );
  return result.rows;
}

export async function deleteInstallmentsByInvoice(
  exec: Executor,
  organizationId: string,
  invoiceId: string,
): Promise<void> {
  await exec.query(
    `
      DELETE FROM agency_invoice_installments
      WHERE invoice_id = $1 AND organization_id = $2;
    `,
    [invoiceId, organizationId],
  );
}

export async function findInstallmentById(
  exec: Executor,
  organizationId: string,
  id: string,
): Promise<AgencyInstallmentRow | null> {
  const result = await exec.query<AgencyInstallmentRow>(
    `
      SELECT ${INSTALLMENT_COLUMNS}
      FROM agency_invoice_installments
      WHERE id = $1 AND organization_id = $2
      LIMIT 1;
    `,
    [id, organizationId],
  );
  return result.rows[0] ?? null;
}

export async function updateInstallmentStatus(
  exec: Executor,
  organizationId: string,
  id: string,
  status: AgencyInstallmentStatus,
  paidAt: Date | null,
): Promise<AgencyInstallmentRow | null> {
  const result = await exec.query<AgencyInstallmentRow>(
    `
      UPDATE agency_invoice_installments
      SET status = $1, paid_at = $2, updated_at = NOW()
      WHERE id = $3 AND organization_id = $4
      RETURNING ${INSTALLMENT_COLUMNS};
    `,
    [status, paidAt, id, organizationId],
  );
  return result.rows[0] ?? null;
}

export async function listOverdueInstallments(
  exec: Executor,
): Promise<AgencyInstallmentRow[]> {
  const result = await exec.query<AgencyInstallmentRow>(
    `
      SELECT ${INSTALLMENT_COLUMNS}
      FROM agency_invoice_installments
      WHERE status = 'pending' AND due_date < CURRENT_DATE;
    `,
  );
  return result.rows;
}
