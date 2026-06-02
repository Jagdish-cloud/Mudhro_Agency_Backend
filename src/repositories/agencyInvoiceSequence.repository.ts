import type { Pool, PoolClient } from "pg";

type Executor = Pool | PoolClient;

/**
 * Atomically allocate the next sequence number for (organization_id, year).
 * Must be called within the invoice-create transaction.
 */
export async function allocateInvoiceSequence(
  exec: Executor,
  organizationId: string,
  year: number,
): Promise<number> {
  const result = await exec.query<{ next_number: number }>(
    `
      INSERT INTO agency_invoice_sequences (organization_id, year, next_number, updated_at)
      VALUES ($1, $2, 2, NOW())
      ON CONFLICT (organization_id, year)
      DO UPDATE SET next_number = agency_invoice_sequences.next_number + 1,
                    updated_at = NOW()
      RETURNING next_number;
    `,
    [organizationId, year],
  );

  // On first insert we start at 2 for the next allocation; return 1 for this one.
  // On conflict the row is incremented and RETURNING gives the NEW next_number;
  // the number just allocated is next_number - 1.
  const next = result.rows[0]?.next_number ?? 1;
  return next - 1;
}
