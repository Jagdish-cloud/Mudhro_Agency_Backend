export type AgencyVendorStatus = "active" | "inactive" | "archived";

export type AgencyVendorRow = {
  id: string;
  organization_id: string;
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  billing_address: string;
  gst_number: string | null;
  pan_number: string | null;
  state_code: string | null;
  status: AgencyVendorStatus;
  notes: string | null;
  tags: string[];
  created_by_org_user_id: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type AgencyVendorDto = {
  id: string;
  organizationId: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  billingAddress: string;
  gstNumber: string | null;
  panNumber: string | null;
  stateCode: string | null;
  status: AgencyVendorStatus;
  notes: string | null;
  tags: string[];
  createdByOrgUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export function toAgencyVendorDto(row: AgencyVendorRow): AgencyVendorDto {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    billingAddress: row.billing_address,
    gstNumber: row.gst_number,
    panNumber: row.pan_number,
    stateCode: row.state_code,
    status: row.status,
    notes: row.notes,
    tags: row.tags ?? [],
    createdByOrgUserId: row.created_by_org_user_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
