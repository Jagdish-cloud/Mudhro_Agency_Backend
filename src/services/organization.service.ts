import { pool } from "../db/pool.js";
import {
  findContactPersonsByOrganizationId,
  findOrganizationById,
  insertAdmins,
  insertContactPersons,
  insertOrganization,
} from "../repositories/organization.repository.js";
import type {
  OrganizationContactPersonRow,
  OrganizationProfileDto,
  OrganizationRow,
  RegisterOrganizationResult,
} from "../types/organization.js";
import { HttpError } from "../utils/httpError.js";
import { hashPassword } from "../utils/password.js";
import type { OrganizationRegistrationInput } from "../validators/organizationRegistration.schema.js";

export async function registerOrganizationService(
  input: OrganizationRegistrationInput,
): Promise<RegisterOrganizationResult> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const org = await insertOrganization(client, input.organization);

    await insertContactPersons(client, org.id, input.contactPersons);

    const adminsWithHash = await Promise.all(
      input.admins.map(async (admin) => ({
        name: admin.name,
        email: admin.email,
        number: admin.number,
        designation: admin.designation,
        passwordHash: await hashPassword(admin.password),
      })),
    );

    await insertAdmins(client, org.id, adminsWithHash);

    await client.query("COMMIT");

    return {
      id: org.id,
      organizationName: org.name,
      message: "Organization registered successfully.",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    const dbError = error as { code?: string; constraint?: string } | undefined;

    if (
      dbError?.code === "23505" &&
      (dbError.constraint === "organization_admins_email_lower_unique" ||
        dbError.constraint === "organization_admins_org_email_unique")
    ) {
      throw new HttpError(409, "This admin email is already registered.");
    }
    if (dbError?.code === "23514") {
      throw new HttpError(400, "Input violates database constraints.");
    }

    throw error;
  } finally {
    client.release();
  }
}

function toOrganizationProfileDto(
  org: OrganizationRow,
  contacts: OrganizationContactPersonRow[],
): OrganizationProfileDto {
  return {
    id: org.id,
    name: org.name,
    address: org.address,
    gstNumber: org.gst_number,
    isUnregistered: org.is_unregistered,
    companyPan: org.company_pan,
    companyMobile: org.company_mobile,
    companyEmail: org.company_email,
    contactPersons: contacts.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      number: c.number,
      designation: c.designation,
    })),
    createdAt: org.created_at.toISOString(),
    updatedAt: org.updated_at.toISOString(),
  };
}

export async function getOrganizationProfileService(
  organizationId: string,
): Promise<OrganizationProfileDto> {
  const org = await findOrganizationById(pool, organizationId);
  if (!org) {
    throw new HttpError(404, "Organization not found.");
  }
  const contacts = await findContactPersonsByOrganizationId(pool, organizationId);
  return toOrganizationProfileDto(org, contacts);
}
