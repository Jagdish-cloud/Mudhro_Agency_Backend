export type AgencyProjectStatus =
  | "active"
  | "completed"
  | "on-hold"
  | "cancelled";

export type AgencyAgreementStatus = "draft" | "pending" | "completed";

export type AgencyProjectRow = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  start_date: Date | null;
  end_date: Date | null;
  status: AgencyProjectStatus;
  budget: string | null;
  currency: string;
  created_by_org_user_id: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type AgencyProjectListRow = AgencyProjectRow & {
  client_count: string;
  agreement_id: string | null;
  agreement_status: AgencyAgreementStatus | null;
  signed_client_count: string | null;
  total_links: string | null;
};

export type AgreementSummaryDto = {
  id: string;
  status: AgencyAgreementStatus;
  signedClientCount: number;
  totalLinks: number;
};

export type AgencyProjectDto = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  status: AgencyProjectStatus;
  budget: number | null;
  currency: string;
  createdByOrgUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgencyProjectListItemDto = AgencyProjectDto & {
  clientCount: number;
  agreementSummary: AgreementSummaryDto | null;
};

function toDateString(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function toNumberOrNull(value: string | null): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function toAgencyProjectDto(row: AgencyProjectRow): AgencyProjectDto {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    startDate: toDateString(row.start_date),
    endDate: toDateString(row.end_date),
    status: row.status,
    budget: toNumberOrNull(row.budget),
    currency: row.currency,
    createdByOrgUserId: row.created_by_org_user_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function toAgencyProjectListItemDto(
  row: AgencyProjectListRow,
): AgencyProjectListItemDto {
  const base = toAgencyProjectDto(row);
  const clientCount = Number(row.client_count ?? 0);
  let agreementSummary: AgreementSummaryDto | null = null;
  if (row.agreement_id && row.agreement_status) {
    agreementSummary = {
      id: row.agreement_id,
      status: row.agreement_status,
      signedClientCount: Number(row.signed_client_count ?? 0),
      totalLinks: Number(row.total_links ?? 0),
    };
  }
  return { ...base, clientCount, agreementSummary };
}
