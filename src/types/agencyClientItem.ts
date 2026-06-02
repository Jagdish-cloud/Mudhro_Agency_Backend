export type AgencyClientItemRow = {
  id: string;
  organization_id: string;
  client_id: string;
  item_name: string;
  description: string | null;
  hsn_code: string;
  default_rate: string;
  default_tax_percent: string;
  default_discount_percent: string;
  unit: string | null;
  created_by_org_user_id: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type AgencyClientItemDto = {
  id: string;
  organizationId: string;
  clientId: string;
  itemName: string;
  description: string | null;
  hsnCode: string;
  defaultRate: number;
  defaultTaxPercent: number;
  defaultDiscountPercent: number;
  unit: string | null;
  createdByOrgUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

function num(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function toAgencyClientItemDto(
  row: AgencyClientItemRow,
): AgencyClientItemDto {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    itemName: row.item_name,
    description: row.description,
    hsnCode: row.hsn_code,
    defaultRate: num(row.default_rate),
    defaultTaxPercent: num(row.default_tax_percent),
    defaultDiscountPercent: num(row.default_discount_percent),
    unit: row.unit,
    createdByOrgUserId: row.created_by_org_user_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
