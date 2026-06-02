import type { Pool, PoolClient } from "pg";

type Executor = Pool | PoolClient;

export type AgencyExpenseServiceRow = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  default_rate: string;
  created_at: Date;
  updated_at: Date;
};

export type AgencyExpenseRow = {
  id: string;
  organization_id: string;
  vendor_id: string;
  project_id: string | null;
  bill_number: string | null;
  bill_date: string;
  due_date: string;
  tax_percentage: string;
  sub_total_amount: string;
  total_amount: string;
  attachment_file_name: string | null;
  expense_file_name: string | null;
  additional_notes: string | null;
  created_at: Date;
  updated_at: Date;
};

export type AgencyExpenseItemRow = {
  id: string;
  expense_id: string;
  service_id: string;
  quantity: string;
  unit_price: string;
  created_at: Date;
  updated_at: Date;
};

const SVC_COLS = `
  id, organization_id, name, description, default_rate, created_at, updated_at`;

const EXP_COLS = `
  id,
  organization_id,
  vendor_id,
  project_id,
  bill_number,
  bill_date,
  due_date,
  tax_percentage,
  sub_total_amount,
  total_amount,
  attachment_file_name,
  expense_file_name,
  additional_notes,
  created_at,
  updated_at`;

const ITEM_COLS = `
  id, expense_id, service_id, quantity, unit_price, created_at, updated_at`;

export async function listExpenseServicesByOrg(
  exec: Executor,
  organizationId: string,
): Promise<AgencyExpenseServiceRow[]> {
  const result = await exec.query<AgencyExpenseServiceRow>(
    `
      SELECT ${SVC_COLS}
      FROM agency_expense_services
      WHERE organization_id = $1
      ORDER BY lower(trim(name)) ASC;
    `,
    [organizationId],
  );
  return result.rows;
}

export async function findExpenseServiceById(
  exec: Executor,
  organizationId: string,
  id: string,
): Promise<AgencyExpenseServiceRow | null> {
  const result = await exec.query<AgencyExpenseServiceRow>(
    `
      SELECT ${SVC_COLS}
      FROM agency_expense_services
      WHERE id = $1 AND organization_id = $2
      LIMIT 1;
    `,
    [id, organizationId],
  );
  return result.rows[0] ?? null;
}

export async function findExpenseServiceByNormalizedName(
  exec: Executor,
  organizationId: string,
  name: string,
): Promise<AgencyExpenseServiceRow | null> {
  const result = await exec.query<AgencyExpenseServiceRow>(
    `
      SELECT ${SVC_COLS}
      FROM agency_expense_services
      WHERE organization_id = $1 AND lower(trim(name)) = lower(trim($2))
      LIMIT 1;
    `,
    [organizationId, name],
  );
  return result.rows[0] ?? null;
}

export async function insertExpenseService(
  exec: Executor,
  params: {
    organizationId: string;
    name: string;
    description: string | null;
    defaultRate: number;
  },
): Promise<AgencyExpenseServiceRow> {
  const result = await exec.query<AgencyExpenseServiceRow>(
    `
      INSERT INTO agency_expense_services (organization_id, name, description, default_rate)
      VALUES ($1, $2, $3, $4)
      RETURNING ${SVC_COLS};
    `,
    [params.organizationId, params.name, params.description, params.defaultRate],
  );
  return result.rows[0];
}

export async function updateExpenseService(
  exec: Executor,
  organizationId: string,
  id: string,
  patch: { name?: string; description?: string | null; defaultRate?: number },
): Promise<AgencyExpenseServiceRow | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (patch.name !== undefined) {
    fields.push(`name = $${i++}`);
    values.push(patch.name);
  }
  if (patch.description !== undefined) {
    fields.push(`description = $${i++}`);
    values.push(patch.description);
  }
  if (patch.defaultRate !== undefined) {
    fields.push(`default_rate = $${i++}`);
    values.push(patch.defaultRate);
  }

  if (fields.length === 0) return findExpenseServiceById(exec, organizationId, id);

  values.push(id, organizationId);
  const result = await exec.query<AgencyExpenseServiceRow>(
    `
      UPDATE agency_expense_services
      SET ${fields.join(", ")}
      WHERE id = $${i++} AND organization_id = $${i}
      RETURNING ${SVC_COLS};
    `,
    values,
  );
  return result.rows[0] ?? null;
}

export async function deleteExpenseService(
  exec: Executor,
  organizationId: string,
  id: string,
): Promise<boolean> {
  const result = await exec.query(
    `
      DELETE FROM agency_expense_services
      WHERE id = $1 AND organization_id = $2;
    `,
    [id, organizationId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listExpensesByOrg(
  exec: Executor,
  organizationId: string,
): Promise<AgencyExpenseRow[]> {
  const result = await exec.query<AgencyExpenseRow>(
    `
      SELECT ${EXP_COLS}
      FROM agency_expenses
      WHERE organization_id = $1
      ORDER BY bill_date DESC, created_at DESC;
    `,
    [organizationId],
  );
  return result.rows;
}

export type ExpenseListWithVendorRow = AgencyExpenseRow & { vendor_name: string };

export async function listExpensesByOrgFiltered(
  exec: Executor,
  organizationId: string,
  filters: {
    fromInclusive?: string;
    toInclusive?: string;
    clientId?: string;
    limit: number;
  },
): Promise<ExpenseListWithVendorRow[]> {
  const where: string[] = ["e.organization_id = $1"];
  const params: unknown[] = [organizationId];
  let i = 2;

  if (filters.fromInclusive) {
    where.push(`e.bill_date >= $${i}::date`);
    params.push(filters.fromInclusive);
    i++;
  }
  if (filters.toInclusive) {
    where.push(`e.bill_date <= $${i}::date`);
    params.push(filters.toInclusive);
    i++;
  }
  if (filters.clientId) {
    where.push(`
      EXISTS (
        SELECT 1 FROM agency_project_clients pc
        WHERE pc.organization_id = e.organization_id
          AND pc.project_id = e.project_id
          AND pc.client_id = $${i}::uuid
      )`);
    params.push(filters.clientId);
    i++;
  }

  where.push(`v.deleted_at IS NULL`);
  params.push(filters.limit);
  const limitPl = `$${params.length}`;

  const result = await exec.query<ExpenseListWithVendorRow>(
    `
      SELECT
        e.id,
        e.organization_id,
        e.vendor_id,
        e.project_id,
        e.bill_number,
        e.bill_date,
        e.due_date,
        e.tax_percentage,
        e.sub_total_amount,
        e.total_amount,
        e.attachment_file_name,
        e.expense_file_name,
        e.additional_notes,
        e.created_at,
        e.updated_at,
        COALESCE(v.name, '') AS vendor_name
      FROM agency_expenses e
      INNER JOIN agency_vendors v ON v.id = e.vendor_id AND v.organization_id = e.organization_id
      WHERE ${where.join(" AND ")}
      ORDER BY e.bill_date DESC, e.created_at DESC
      LIMIT ${limitPl};
    `,
    params,
  );
  return result.rows;
}

export async function listExpensesByProject(
  exec: Executor,
  organizationId: string,
  projectId: string,
): Promise<ExpenseListWithVendorRow[]> {
  const result = await exec.query<ExpenseListWithVendorRow>(
    `
      SELECT
        e.id,
        e.organization_id,
        e.vendor_id,
        e.project_id,
        e.bill_number,
        e.bill_date,
        e.due_date,
        e.tax_percentage,
        e.sub_total_amount,
        e.total_amount,
        e.attachment_file_name,
        e.expense_file_name,
        e.additional_notes,
        e.created_at,
        e.updated_at,
        v.name AS vendor_name
      FROM agency_expenses e
      LEFT JOIN agency_vendors v ON v.id = e.vendor_id
      WHERE e.organization_id = $1 AND e.project_id = $2
      ORDER BY e.bill_date DESC, e.created_at DESC;
    `,
    [organizationId, projectId],
  );
  return result.rows;
}

export async function findExpenseById(
  exec: Executor,
  organizationId: string,
  id: string,
): Promise<AgencyExpenseRow | null> {
  const result = await exec.query<AgencyExpenseRow>(
    `
      SELECT ${EXP_COLS}
      FROM agency_expenses
      WHERE id = $1 AND organization_id = $2
      LIMIT 1;
    `,
    [id, organizationId],
  );
  return result.rows[0] ?? null;
}

export async function insertExpense(
  exec: Executor,
  params: {
    organizationId: string;
    vendorId: string;
    projectId: string | null;
    billNumber: string | null;
    billDate: string;
    dueDate: string;
    taxPercentage: number;
    subTotalAmount: number;
    totalAmount: number;
    additionalNotes: string | null;
  },
): Promise<AgencyExpenseRow> {
  const result = await exec.query<AgencyExpenseRow>(
    `
      INSERT INTO agency_expenses (
        organization_id,
        vendor_id,
        project_id,
        bill_number,
        bill_date,
        due_date,
        tax_percentage,
        sub_total_amount,
        total_amount,
        additional_notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING ${EXP_COLS};
    `,
    [
      params.organizationId,
      params.vendorId,
      params.projectId,
      params.billNumber,
      params.billDate,
      params.dueDate,
      params.taxPercentage,
      params.subTotalAmount,
      params.totalAmount,
      params.additionalNotes,
    ],
  );
  return result.rows[0];
}

export async function updateExpense(
  exec: Executor,
  organizationId: string,
  id: string,
  patch: {
    vendorId?: string;
    projectId?: string | null;
    billNumber?: string | null;
    billDate?: string;
    dueDate?: string;
    taxPercentage?: number;
    subTotalAmount?: number;
    totalAmount?: number;
    additionalNotes?: string | null;
    attachmentFileName?: string | null;
    expenseFileName?: string | null;
  },
): Promise<AgencyExpenseRow | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  const add = (col: string, val: unknown) => {
    fields.push(`${col} = $${i++}`);
    values.push(val);
  };

  if (patch.vendorId !== undefined) add("vendor_id", patch.vendorId);
  if (patch.projectId !== undefined) add("project_id", patch.projectId);
  if (patch.billNumber !== undefined) add("bill_number", patch.billNumber);
  if (patch.billDate !== undefined) add("bill_date", patch.billDate);
  if (patch.dueDate !== undefined) add("due_date", patch.dueDate);
  if (patch.taxPercentage !== undefined) add("tax_percentage", patch.taxPercentage);
  if (patch.subTotalAmount !== undefined) add("sub_total_amount", patch.subTotalAmount);
  if (patch.totalAmount !== undefined) add("total_amount", patch.totalAmount);
  if (patch.additionalNotes !== undefined) add("additional_notes", patch.additionalNotes);
  if (patch.attachmentFileName !== undefined) add("attachment_file_name", patch.attachmentFileName);
  if (patch.expenseFileName !== undefined) add("expense_file_name", patch.expenseFileName);

  if (fields.length === 0) return findExpenseById(exec, organizationId, id);

  values.push(id, organizationId);
  const result = await exec.query<AgencyExpenseRow>(
    `
      UPDATE agency_expenses
      SET ${fields.join(", ")}
      WHERE id = $${i++} AND organization_id = $${i}
      RETURNING ${EXP_COLS};
    `,
    values,
  );
  return result.rows[0] ?? null;
}

export async function deleteExpense(
  exec: Executor,
  organizationId: string,
  id: string,
): Promise<AgencyExpenseRow | null> {
  const result = await exec.query<AgencyExpenseRow>(
    `
      DELETE FROM agency_expenses
      WHERE id = $1 AND organization_id = $2
      RETURNING ${EXP_COLS};
    `,
    [id, organizationId],
  );
  return result.rows[0] ?? null;
}

export type ExpenseItemWithServiceRow = AgencyExpenseItemRow & {
  service_name: string;
};

export async function listExpenseItemsWithService(
  exec: Executor,
  organizationId: string,
  expenseId: string,
): Promise<ExpenseItemWithServiceRow[]> {
  const result = await exec.query<ExpenseItemWithServiceRow>(
    `
      SELECT
        i.id,
        i.expense_id,
        i.service_id,
        i.quantity,
        i.unit_price,
        i.created_at,
        i.updated_at,
        s.name AS service_name
      FROM agency_expense_items i
      INNER JOIN agency_expenses e ON e.id = i.expense_id
      INNER JOIN agency_expense_services s ON s.id = i.service_id
      WHERE e.organization_id = $1 AND i.expense_id = $2
      ORDER BY i.created_at ASC;
    `,
    [organizationId, expenseId],
  );
  return result.rows;
}

export async function findExpenseItemById(
  exec: Executor,
  organizationId: string,
  itemId: string,
): Promise<AgencyExpenseItemRow | null> {
  const result = await exec.query<AgencyExpenseItemRow>(
    `
      SELECT
        i.id,
        i.expense_id,
        i.service_id,
        i.quantity,
        i.unit_price,
        i.created_at,
        i.updated_at
      FROM agency_expense_items i
      INNER JOIN agency_expenses e ON e.id = i.expense_id
      WHERE i.id = $1 AND e.organization_id = $2
      LIMIT 1;
    `,
    [itemId, organizationId],
  );
  return result.rows[0] ?? null;
}

export async function insertExpenseItem(
  exec: Executor,
  params: { expenseId: string; serviceId: string; quantity: number; unitPrice: number },
): Promise<AgencyExpenseItemRow> {
  const result = await exec.query<AgencyExpenseItemRow>(
    `
      INSERT INTO agency_expense_items (expense_id, service_id, quantity, unit_price)
      VALUES ($1, $2, $3, $4)
      RETURNING ${ITEM_COLS};
    `,
    [params.expenseId, params.serviceId, params.quantity, params.unitPrice],
  );
  return result.rows[0];
}

export async function updateExpenseItem(
  exec: Executor,
  organizationId: string,
  itemId: string,
  patch: { serviceId?: string; quantity?: number; unitPrice?: number },
): Promise<AgencyExpenseItemRow | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (patch.serviceId !== undefined) {
    fields.push(`service_id = $${i++}`);
    values.push(patch.serviceId);
  }
  if (patch.quantity !== undefined) {
    fields.push(`quantity = $${i++}`);
    values.push(patch.quantity);
  }
  if (patch.unitPrice !== undefined) {
    fields.push(`unit_price = $${i++}`);
    values.push(patch.unitPrice);
  }

  if (fields.length === 0) return findExpenseItemById(exec, organizationId, itemId);

  values.push(itemId, organizationId);
  const result = await exec.query<AgencyExpenseItemRow>(
    `
      UPDATE agency_expense_items i
      SET ${fields.join(", ")}
      FROM agency_expenses e
      WHERE i.id = $${i++} AND i.expense_id = e.id AND e.organization_id = $${i}
      RETURNING i.id, i.expense_id, i.service_id, i.quantity, i.unit_price, i.created_at, i.updated_at;
    `,
    values,
  );
  return result.rows[0] ?? null;
}

export async function deleteExpenseItem(
  exec: Executor,
  organizationId: string,
  itemId: string,
): Promise<boolean> {
  const result = await exec.query(
    `
      DELETE FROM agency_expense_items i
      USING agency_expenses e
      WHERE i.id = $1 AND i.expense_id = e.id AND e.organization_id = $2;
    `,
    [itemId, organizationId],
  );
  return (result.rowCount ?? 0) > 0;
}
