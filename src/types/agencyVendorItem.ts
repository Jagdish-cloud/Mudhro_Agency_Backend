export type AgencyVendorItemRow = {
  id: string;
  organization_id: string;
  vendor_id: string;
  service_id: string;
  item_name: string;
  description: string | null;
  default_quantity: string;
  default_rate: string;
  created_by_org_user_id: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type AgencyVendorItemWithServiceRow = AgencyVendorItemRow & {
  service_name: string;
};

export type AgencyVendorItemDto = {
  id: string;
  organizationId: string;
  vendorId: string;
  serviceId: string;
  serviceName: string;
  itemName: string;
  description: string | null;
  defaultQuantity: number;
  defaultRate: number;
  createdByOrgUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

function num(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function toAgencyVendorItemDto(
  row: AgencyVendorItemWithServiceRow | AgencyVendorItemRow,
  serviceName?: string,
): AgencyVendorItemDto {
  const svcName =
    "service_name" in row ? row.service_name : (serviceName ?? "");
  return {
    id: row.id,
    organizationId: row.organization_id,
    vendorId: row.vendor_id,
    serviceId: row.service_id,
    serviceName: svcName,
    itemName: row.item_name,
    description: row.description,
    defaultQuantity: num(row.default_quantity),
    defaultRate: num(row.default_rate),
    createdByOrgUserId: row.created_by_org_user_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
