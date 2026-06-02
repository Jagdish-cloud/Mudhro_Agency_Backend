import {
  getFileUrl,
  isAzureConfigured,
  resolveSignatureDownloadContainer,
} from "../services/azureBlob.service.js";
import type { AgreementDto } from "../types/agencyAgreement.js";

/**
 * Adds a short-lived SAS URL so the agency UI can render the service-provider
 * signature when editing an existing agreement.
 */
export async function enrichAgreementDtoWithSignaturePreview(
  dto: AgreementDto,
): Promise<AgreementDto> {
  if (!isAzureConfigured()) return dto;
  const sp = dto.signatures.find((s) => s.signerType === "service_provider");
  if (!sp?.signatureImagePath) return dto;
  try {
    const container = resolveSignatureDownloadContainer(
      sp.signatureImagePath,
      sp.signatureImageContainer,
    );
    const serviceProviderSignaturePreviewUrl = await getFileUrl(container, sp.signatureImagePath, {
      expiresInMinutes: 60,
    });
    return { ...dto, serviceProviderSignaturePreviewUrl };
  } catch {
    return dto;
  }
}
