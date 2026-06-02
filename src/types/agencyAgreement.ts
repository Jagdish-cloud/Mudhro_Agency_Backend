export type AgreementStatus = "draft" | "pending" | "completed";
export type AgreementDurationUnit = "days" | "weeks" | "months";
export type AgreementPaymentStructure =
  | "50-50"
  | "100-upfront"
  | "100-completion"
  | "milestone-based";
export type AgreementMilestoneStatus = "pending" | "created";
export type AgreementSignerType = "service_provider" | "client";
export type AgreementClientLinkStatus = "pending" | "client_signed" | "expired";

export type AgreementRow = {
  id: string;
  organization_id: string;
  project_id: string;
  service_provider_name: string;
  agreement_date: Date;
  service_type: string;
  start_date: Date | null;
  end_date: Date | null;
  duration: number | null;
  duration_unit: AgreementDurationUnit | null;
  number_of_revisions: number;
  jurisdiction: string | null;
  status: AgreementStatus;
  document_id: string | null;
  final_pdf_blob_path: string | null;
  final_pdf_blob_container: string | null;
  final_pdf_byte_size: string | null;
  final_pdf_content_type: string | null;
  final_pdf_uploaded_at: Date | null;
  created_by_org_user_id: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type AgreementDeliverableRow = {
  id: string;
  agreement_id: string;
  description: string;
  sort_order: number;
};

export type AgreementPaymentTermRow = {
  id: string;
  agreement_id: string;
  payment_structure: AgreementPaymentStructure;
  payment_method: string | null;
};

export type AgreementMilestoneRow = {
  id: string;
  agreement_payment_term_id: string;
  description: string;
  amount: string;
  sort_order: number;
  milestone_date_str: string | null;
  status: AgreementMilestoneStatus;
};

export type AgreementSignatureRow = {
  id: string;
  agreement_id: string;
  signer_type: AgreementSignerType;
  client_id: string | null;
  signer_name: string;
  signature_image_name: string | null;
  signature_image_path: string | null;
  blob_container: string | null;
  ip_address: string | null;
  document_id: string | null;
  signed_at: Date;
};

export type AgreementClientLinkRow = {
  id: string;
  agreement_id: string;
  client_id: string;
  token: string;
  expires_at: Date;
  status: AgreementClientLinkStatus;
  email_sent_at: Date | null;
  signed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

// DTOs
export type AgreementDeliverableDto = {
  id: string;
  description: string;
  order: number;
};

export type AgreementMilestoneDto = {
  id: string;
  description: string;
  amount: number;
  date: string | null;
  order: number;
  status: AgreementMilestoneStatus;
};

export type AgreementPaymentTermsDto = {
  id: string;
  paymentStructure: AgreementPaymentStructure;
  paymentMethod: string | null;
  milestones: AgreementMilestoneDto[];
};

export type AgreementSignatureDto = {
  id: string;
  signerType: AgreementSignerType;
  clientId: string | null;
  signerName: string;
  signatureImageName: string | null;
  signatureImagePath: string | null;
  /** Azure container for this PNG; null rows use legacy env resolution from path. */
  signatureImageContainer: string | null;
  ipAddress: string | null;
  documentId: string | null;
  signedAt: string;
};

export type AgreementClientLinkDto = {
  id: string;
  agreementId: string;
  clientId: string;
  token: string;
  expiresAt: string;
  status: AgreementClientLinkStatus;
  emailSentAt: string | null;
  signedAt: string | null;
};

export type AgreementDto = {
  id: string;
  organizationId: string;
  projectId: string;
  serviceProviderName: string;
  agreementDate: string;
  serviceType: string;
  startDate: string | null;
  endDate: string | null;
  duration: number | null;
  durationUnit: AgreementDurationUnit | null;
  numberOfRevisions: number;
  jurisdiction: string | null;
  status: AgreementStatus;
  documentId: string | null;
  finalPdfBlobPath: string | null;
  finalPdfBlobContainer: string | null;
  finalPdfByteSize: number | null;
  finalPdfContentType: string | null;
  finalPdfUploadedAt: string | null;
  deliverables: AgreementDeliverableDto[];
  paymentTerms: AgreementPaymentTermsDto | null;
  signatures: AgreementSignatureDto[];
  createdAt: string;
  updatedAt: string;
  /** Present when the API generated a read SAS for the service-provider PNG. */
  serviceProviderSignaturePreviewUrl?: string;
};

export type AgreementWithLinksDto = AgreementDto & {
  links: AgreementClientLinkDto[];
};

function dateToIso(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

export function toAgreementDeliverableDto(
  row: AgreementDeliverableRow,
): AgreementDeliverableDto {
  return {
    id: row.id,
    description: row.description,
    order: row.sort_order,
  };
}

export function toAgreementMilestoneDto(
  row: AgreementMilestoneRow,
): AgreementMilestoneDto {
  return {
    id: row.id,
    description: row.description,
    amount: Number(row.amount),
    date: row.milestone_date_str,
    order: row.sort_order,
    status: row.status,
  };
}

export function toAgreementPaymentTermsDto(
  term: AgreementPaymentTermRow,
  milestones: AgreementMilestoneRow[],
): AgreementPaymentTermsDto {
  return {
    id: term.id,
    paymentStructure: term.payment_structure,
    paymentMethod: term.payment_method,
    milestones: milestones
      .filter((m) => m.agreement_payment_term_id === term.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(toAgreementMilestoneDto),
  };
}

export function toAgreementSignatureDto(
  row: AgreementSignatureRow,
): AgreementSignatureDto {
  return {
    id: row.id,
    signerType: row.signer_type,
    clientId: row.client_id,
    signerName: row.signer_name,
    signatureImageName: row.signature_image_name,
    signatureImagePath: row.signature_image_path,
    signatureImageContainer: row.blob_container,
    ipAddress: row.ip_address,
    documentId: row.document_id,
    signedAt: row.signed_at.toISOString(),
  };
}

export function toAgreementClientLinkDto(
  row: AgreementClientLinkRow,
): AgreementClientLinkDto {
  return {
    id: row.id,
    agreementId: row.agreement_id,
    clientId: row.client_id,
    token: row.token,
    expiresAt: row.expires_at.toISOString(),
    status: row.status,
    emailSentAt: row.email_sent_at ? row.email_sent_at.toISOString() : null,
    signedAt: row.signed_at ? row.signed_at.toISOString() : null,
  };
}

export function toAgreementDto(args: {
  agreement: AgreementRow;
  deliverables: AgreementDeliverableRow[];
  paymentTerm: AgreementPaymentTermRow | null;
  milestones: AgreementMilestoneRow[];
  signatures: AgreementSignatureRow[];
}): AgreementDto {
  const { agreement, deliverables, paymentTerm, milestones, signatures } = args;
  return {
    id: agreement.id,
    organizationId: agreement.organization_id,
    projectId: agreement.project_id,
    serviceProviderName: agreement.service_provider_name,
    agreementDate: dateToIso(agreement.agreement_date) ?? "",
    serviceType: agreement.service_type,
    startDate: dateToIso(agreement.start_date),
    endDate: dateToIso(agreement.end_date),
    duration: agreement.duration,
    durationUnit: agreement.duration_unit,
    numberOfRevisions: agreement.number_of_revisions,
    jurisdiction: agreement.jurisdiction,
    status: agreement.status,
    documentId: agreement.document_id,
    finalPdfBlobPath: agreement.final_pdf_blob_path,
    finalPdfBlobContainer: agreement.final_pdf_blob_container,
    finalPdfByteSize:
      agreement.final_pdf_byte_size != null ? Number(agreement.final_pdf_byte_size) : null,
    finalPdfContentType: agreement.final_pdf_content_type,
    finalPdfUploadedAt: agreement.final_pdf_uploaded_at
      ? agreement.final_pdf_uploaded_at.toISOString()
      : null,
    deliverables: deliverables
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(toAgreementDeliverableDto),
    paymentTerms: paymentTerm
      ? toAgreementPaymentTermsDto(paymentTerm, milestones)
      : null,
    signatures: signatures.map(toAgreementSignatureDto),
    createdAt: agreement.created_at.toISOString(),
    updatedAt: agreement.updated_at.toISOString(),
  };
}
