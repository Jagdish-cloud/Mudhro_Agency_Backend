import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn() },
}));

const linkRepo = vi.hoisted(() => ({
  findLinkByToken: vi.fn(),
  markLinkSigned: vi.fn(),
  setLinkStatus: vi.fn(),
  countSignedLinksForAgreement: vi.fn(),
}));

vi.mock("../src/repositories/agreementClientLink.repository.js", () => linkRepo);

const agreementRepo = vi.hoisted(() => ({
  findAgreementByIdAnyOrg: vi.fn(),
  findClientSignature: vi.fn(),
  insertSignature: vi.fn(),
  listDeliverables: vi.fn().mockResolvedValue([]),
  findPaymentTermsByAgreement: vi.fn().mockResolvedValue(null),
  listMilestonesByAgreement: vi.fn().mockResolvedValue([]),
  listSignaturesByAgreement: vi.fn().mockResolvedValue([]),
  setAgreementStatus: vi.fn(),
  deleteSignatureById: vi.fn(),
  updateAgreementFinalPdf: vi.fn(),
}));

vi.mock("../src/repositories/agencyAgreement.repository.js", () => agreementRepo);

vi.mock("../src/repositories/agencyClient.repository.js", () => ({
  findAgencyClientById: vi.fn(),
}));

vi.mock("../src/repositories/agencyProject.repository.js", () => ({
  findAgencyProjectById: vi.fn(),
}));

vi.mock("../src/services/azureBlob.service.js", () => ({
  uploadClientSignaturePng: vi.fn().mockResolvedValue({
    blobPath: "x/sig.png",
    containerName: "agencyuatfiles",
    url: "https://blob",
  }),
  uploadAgreementPdfToProject: vi.fn().mockResolvedValue({
    url: "https://pdf",
    containerName: "agencyuatfiles",
    blobPath: "Org_x/Project_y/Agreements/a.pdf",
  }),
  deleteBlob: vi.fn(),
  resolveSignatureDownloadContainer: vi.fn(() => "agencyuatfiles"),
  getFileUrl: vi.fn().mockResolvedValue("https://read-sas"),
  isAzureConfigured: vi.fn().mockReturnValue(true),
}));

vi.mock("../src/services/agreementPdf.service.js", () => ({
  generateAgreementPdf: vi
    .fn()
    .mockResolvedValue({ buffer: Buffer.from("%PDF"), filename: "agreement-agr-1.pdf" }),
}));

vi.mock("../src/utils/enrichAgreementDto.js", () => ({
  enrichAgreementDtoWithSignaturePreview: vi.fn(async (dto: unknown) => dto),
}));

import {
  getAgreementByToken,
  resignClientSignature,
  streamAgreementPdfForPortalToken,
  submitClientSignature,
} from "../src/services/agreementPortal.service.js";

const future = new Date(Date.now() + 86400000);
const past = new Date(Date.now() - 86400000);

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
    status: "pending" as const,
    document_id: "doc-1",
    final_pdf_blob_path: null,
    final_pdf_blob_container: null,
    final_pdf_byte_size: null,
    final_pdf_content_type: null,
    final_pdf_uploaded_at: null,
    created_by_org_user_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    ...overrides,
  };
}

function link(overrides: Record<string, unknown> = {}) {
  return {
    id: "lnk-1",
    agreement_id: "agr-1",
    client_id: "cli-1",
    token: "tok",
    expires_at: future,
    status: "pending" as const,
    email_sent_at: new Date(),
    signed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe("agreementPortal.service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getAgreementByToken returns expired when past expires_at", async () => {
    linkRepo.findLinkByToken.mockResolvedValue(link({ expires_at: past, status: "pending" }));
    const res = await getAgreementByToken("tok");
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.expired).toBe(true);
  });

  it("submitClientSignature rejects when already signed", async () => {
    linkRepo.findLinkByToken.mockResolvedValue(link({ status: "client_signed" }));
    await expect(
      submitClientSignature("tok", { signerName: "Bob", signatureImage: "data:image/png;base64,QQ==" }, null),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("submitClientSignature persists PDF and returns read URL", async () => {
    linkRepo.findLinkByToken.mockResolvedValue(link());
    agreementRepo.findAgreementByIdAnyOrg.mockResolvedValue(agreementRow());
    linkRepo.countSignedLinksForAgreement.mockResolvedValue({ total: 2, signed: 1 });

    const res = await submitClientSignature(
      "tok",
      { signerName: "Bob", signatureImage: "data:image/png;base64,QQ==" },
      null,
    );

    expect(agreementRepo.updateAgreementFinalPdf).toHaveBeenCalled();
    expect(res.pdfUrl).toBe("https://read-sas");
    expect(res.completed).toBe(false);
  });

  it("streamAgreementPdfForPortalToken returns PDF buffer for pending link", async () => {
    linkRepo.findLinkByToken.mockResolvedValue(link());
    agreementRepo.findAgreementByIdAnyOrg.mockResolvedValue(agreementRow());

    const { buffer, filename } = await streamAgreementPdfForPortalToken("tok");
    expect(buffer.toString()).toBe("%PDF");
    expect(filename).toContain("agr-1");
  });

  it("resignClientSignature rejects when link already completed", async () => {
    linkRepo.findLinkByToken.mockResolvedValue(link({ status: "client_signed" }));
    await expect(
      resignClientSignature("tok", { signerName: "Bob", signatureImage: "data:image/png;base64,QQ==" }, null),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
