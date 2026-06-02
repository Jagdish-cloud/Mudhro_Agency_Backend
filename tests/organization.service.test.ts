import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

const repoMocks = vi.hoisted(() => ({
  findOrganizationById: vi.fn(),
  findContactPersonsByOrganizationId: vi.fn(),
  insertOrganization: vi.fn(),
  insertContactPersons: vi.fn(),
  insertAdmins: vi.fn(),
}));

vi.mock("../src/repositories/organization.repository.js", () => repoMocks);

import { getOrganizationProfileService } from "../src/services/organization.service.js";

const now = new Date("2025-01-01T10:00:00.000Z");

describe("organization service - getOrganizationProfileService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("aggregates org + contact persons into a DTO", async () => {
    repoMocks.findOrganizationById.mockResolvedValue({
      id: "org-1",
      name: "Mudhro Agency",
      address: "HSR Layout",
      gst_number: "29ABCDE1234F1Z5",
      is_unregistered: false,
      company_pan: "ABCDE1234F",
      company_mobile: "9876543210",
      company_email: "hello@mudhro.agency",
      created_at: now,
      updated_at: now,
    });
    repoMocks.findContactPersonsByOrganizationId.mockResolvedValue([
      {
        id: "cp-1",
        organization_id: "org-1",
        name: "Aman",
        email: "aman@mudhro.agency",
        number: "9876543210",
        designation: "Founder",
      },
    ]);

    const result = await getOrganizationProfileService("org-1");

    expect(result.id).toBe("org-1");
    expect(result.name).toBe("Mudhro Agency");
    expect(result.gstNumber).toBe("29ABCDE1234F1Z5");
    expect(result.isUnregistered).toBe(false);
    expect(result.companyPan).toBe("ABCDE1234F");
    expect(result.contactPersons).toHaveLength(1);
    expect(result.contactPersons[0]).toEqual({
      id: "cp-1",
      name: "Aman",
      email: "aman@mudhro.agency",
      number: "9876543210",
      designation: "Founder",
    });
    expect(result.createdAt).toBe(now.toISOString());
  });

  it("returns gstNumber null + isUnregistered true correctly", async () => {
    repoMocks.findOrganizationById.mockResolvedValue({
      id: "org-2",
      name: "Small Shop",
      address: "Koramangala",
      gst_number: null,
      is_unregistered: true,
      company_pan: "ABCDE1234F",
      company_mobile: "9876543210",
      company_email: "small@shop.in",
      created_at: now,
      updated_at: now,
    });
    repoMocks.findContactPersonsByOrganizationId.mockResolvedValue([]);

    const result = await getOrganizationProfileService("org-2");
    expect(result.gstNumber).toBeNull();
    expect(result.isUnregistered).toBe(true);
    expect(result.contactPersons).toEqual([]);
  });

  it("throws 404 when org is missing", async () => {
    repoMocks.findOrganizationById.mockResolvedValue(null);
    await expect(getOrganizationProfileService("missing")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
