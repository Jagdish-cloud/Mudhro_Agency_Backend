import type { Pool, PoolClient } from "pg";

import type {
  OrganizationContactPersonRow,
  OrganizationRow,
} from "../types/organization.js";
import type { OrganizationRegistrationInput } from "../validators/organizationRegistration.schema.js";

export async function insertOrganization(
  client: PoolClient,
  organization: OrganizationRegistrationInput["organization"],
): Promise<{ id: string; name: string }> {
  const query = `
    INSERT INTO organizations (
      name,
      address,
      gst_number,
      is_unregistered,
      company_pan,
      company_mobile,
      company_email
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, name;
  `;

  const values = [
    organization.name,
    organization.address,
    organization.gstNumber,
    organization.isUnregistered,
    organization.companyPan,
    organization.companyMobile,
    organization.companyEmail,
  ];

  const result = await client.query<{ id: string; name: string }>(query, values);
  return result.rows[0];
}

export async function insertContactPersons(
  client: PoolClient,
  organizationId: string,
  contactPersons: OrganizationRegistrationInput["contactPersons"],
): Promise<void> {
  const values: string[] = [];
  const params: unknown[] = [];

  contactPersons.forEach((c, index) => {
    const offset = index * 5;
    values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
    params.push(organizationId, c.name, c.email, c.number, c.designation);
  });

  const query = `
    INSERT INTO organization_contact_persons (
      organization_id,
      name,
      email,
      number,
      designation
    ) VALUES ${values.join(", ")};
  `;

  await client.query(query, params);
}

export async function findOrganizationById(
  pool: Pool,
  id: string,
): Promise<OrganizationRow | null> {
  const result = await pool.query<OrganizationRow>(
    `
      SELECT
        id,
        name,
        address,
        gst_number,
        is_unregistered,
        company_pan,
        company_mobile,
        company_email,
        created_at,
        updated_at
      FROM organizations
      WHERE id = $1
      LIMIT 1;
    `,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function findContactPersonsByOrganizationId(
  pool: Pool,
  organizationId: string,
): Promise<OrganizationContactPersonRow[]> {
  const result = await pool.query<OrganizationContactPersonRow>(
    `
      SELECT
        id,
        organization_id,
        name,
        email,
        number,
        designation
      FROM organization_contact_persons
      WHERE organization_id = $1
      ORDER BY created_at ASC;
    `,
    [organizationId],
  );
  return result.rows;
}

export async function insertAdmins(
  client: PoolClient,
  organizationId: string,
  admins: Array<{
    name: string;
    email: string;
    number: string;
    designation: string;
    passwordHash: string;
  }>,
): Promise<void> {
  const values: string[] = [];
  const params: unknown[] = [];

  admins.forEach((a, index) => {
    const offset = index * 7;
    values.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`,
    );
    // Role 1 = Admin. The registration flow always provisions org admins.
    params.push(organizationId, a.name, a.email, a.number, a.designation, a.passwordHash, 1);
  });

  const query = `
    INSERT INTO organization_admins (
      organization_id,
      name,
      email,
      number,
      designation,
      password_hash,
      role
    ) VALUES ${values.join(", ")};
  `;

  await client.query(query, params);
}
