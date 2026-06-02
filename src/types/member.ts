import type { UserRole } from "./auth.js";

export type MemberStatus = "active" | "inactive";

export type MemberDto = {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  number: string;
  designation: string;
  role: UserRole;
  status: MemberStatus;
  createdAt: string;
  updatedAt: string;
};

export type MemberRow = {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  number: string;
  designation: string;
  role: UserRole;
  status: MemberStatus;
  created_at: Date;
  updated_at: Date;
};

export function toMemberDto(row: MemberRow): MemberDto {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    email: row.email,
    number: row.number,
    designation: row.designation,
    role: row.role,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
