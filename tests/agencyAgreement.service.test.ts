import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

const agreementRepo = vi.hoisted(() => ({
  findAgreementByProjectId: vi.fn(),
  findAgreementById: vi.fn(),
  insertAgreement: vi.fn(),
  updateAgreementDocumentId: vi.fn(),
  insertDeliverables: vi.fn(),
  insertPaymentTerms: vi.fn(),
  insertMilestones: vi.fn(),
  insertSignature: vi.fn(),
  updateAgreementCore: vi.fn(),
  deleteDeliverables: vi.fn(),
  deletePaymentTerms: vi.fn(),
}));

vi.mock("../src/repositories/agencyAgreement.repository.js", () => agreementRepo);

vi.mock("../src/repositories/agencyProject.repository.js", () => ({
  findAgencyProjectById: vi.fn(),
}));

vi.mock("../src/services/azureBlob.service.js", () => ({
  uploadServiceProviderSignaturePng: vi
    .fn()
    .mockResolvedValue({ blobPath: "proj/sig.png", containerName: "agencyuatfiles", url: "https://blob" }),
}));

import { findAgencyProjectById } from "../src/repositories/agencyProject.repository.js";
import { createAgencyAgreementService, updateAgreementService } from "../src/services/agencyAgreement.service.js";
import { HttpError } from "../src/utils/httpError.js";

const now = new Date("2026-01-10T12:00:00.000Z");
const oldCreated = new Date("2026-01-01T00:00:00.000Z");

function agreementRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "agr-1",
    organization_id: "org-1",
    project_id: "proj-1",
    service_provider_name: "SP",
    agreement_date: new Date("2026-01-05"),
    service_type: "Dev",
    start_date: null,
    end_date: null,
    duration: null,
    duration_unit: null,
    number_of_revisions: 0,
    jurisdiction: null,
    status: "draft",
    document_id: null,
    final_pdf_blob_path: null,
    final_pdf_blob_container: null,
    final_pdf_byte_size: null,
    final_pdf_content_type: null,
    final_pdf_uploaded_at: null,
    created_by_org_user_id: "adm-1",
    created_at: now,
    updated_at: now,
    deleted_at: null,
    ...overrides,
  };
}

describe("agencyAgreement.service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("createAgencyAgreementService rejects when agreement already exists", async () => {
    vi.mocked(findAgencyProjectById).mockResolvedValue({
      id: "proj-1",
      organization_id: "org-1",
      budget: "100",
      currency: "INR",
    } as never);
    agreementRepo.findAgreementByProjectId.mockResolvedValue(agreementRow());

    await expect(
      createAgencyAgreementService("org-1", "adm-1", "proj-1", null, {
        serviceProviderName: "SP",
        agreementDate: "2026-01-10",
        serviceType: "Work",
        startDate: null,
        endDate: null,
        duration: null,
        durationUnit: null,
        numberOfRevisions: 0,
        jurisdiction: null,
        deliverables: [{ description: "D1" }],
        paymentTerms: { paymentStructure: "100-upfront", paymentMethod: null, milestones: [] },
        serviceProviderSignerName: "Alice",
        serviceProviderSignatureImage: "data:image/png;base64,AAAA",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("createAgencyAgreementService rejects milestone total over budget", async () => {
    vi.mocked(findAgencyProjectById).mockResolvedValue({
      id: "proj-1",
      organization_id: "org-1",
      budget: "100",
      currency: "INR",
    } as never);
    agreementRepo.findAgreementByProjectId.mockResolvedValue(null);

    await expect(
      createAgencyAgreementService("org-1", "adm-1", "proj-1", null, {
        serviceProviderName: "SP",
        agreementDate: "2026-01-10",
        serviceType: "Work",
        startDate: null,
        endDate: null,
        duration: null,
        durationUnit: null,
        numberOfRevisions: 0,
        jurisdiction: null,
        deliverables: [{ description: "D1" }],
        paymentTerms: {
          paymentStructure: "milestone-based",
          paymentMethod: null,
          milestones: [{ description: "M1", amount: 200, date: "2026-02-01" }],
        },
        serviceProviderSignerName: "Alice",
        serviceProviderSignatureImage: "data:image/png;base64,AAAA",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("updateAgreementService rejects outside 2-day edit window", async () => {
    agreementRepo.findAgreementById.mockResolvedValue(agreementRow({ created_at: oldCreated }));

    await expect(
      updateAgreementService("org-1", "agr-1", { serviceType: "Updated" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
