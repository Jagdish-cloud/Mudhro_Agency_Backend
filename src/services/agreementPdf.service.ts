import { pool } from "../db/pool.js";
import { listClientsForProject } from "../repositories/agencyProjectClient.repository.js";
import { findAgencyProjectById } from "../repositories/agencyProject.repository.js";
import {
  findAgreementById,
  findPaymentTermsByAgreement,
  listDeliverables,
  listMilestonesByAgreement,
  listSignaturesByAgreement,
} from "../repositories/agencyAgreement.repository.js";
import type {
  AgreementMilestoneRow,
  AgreementPaymentStructure,
  AgreementSignatureRow,
} from "../types/agencyAgreement.js";
import { HttpError } from "../utils/httpError.js";
import { createPdfDocument, PDF_FONT, PDF_FONT_BOLD, type PdfDoc } from "../utils/pdfKitFonts.js";
import { downloadBlobBuffer, resolveSignatureDownloadContainer } from "./azureBlob.service.js";

type PaymentStructureLabel = {
  key: AgreementPaymentStructure;
  label: string;
};

const PAYMENT_STRUCTURE_LABELS: PaymentStructureLabel[] = [
  { key: "50-50", label: "50% upfront, 50% on completion" },
  { key: "100-upfront", label: "100% upfront" },
  { key: "100-completion", label: "100% on completion" },
  { key: "milestone-based", label: "Milestone-based" },
];

/** Signature bitmap box in points; keeps ink inside a predictable strip below headings. */
const SIG_IMAGE_FIT: [number, number] = [160, 52];
const SIG_GAP_BELOW_BOX = 14;

/**
 * PDFKit only advances `doc.y` after `image()` when an internal `this.y === y` check passes; for PNG flow
 * that often fails, so the next `text()` reuses the pre-image cursor and overlaps the bitmap. We always
 * reserve a fixed block height and move the cursor below it.
 */
function drawSignatureImageInFlow(doc: PdfDoc, buf: Buffer): void {
  const yStart = doc.y;
  doc.image(buf, { fit: SIG_IMAGE_FIT, valign: "center" });
  doc.y = yStart + SIG_IMAGE_FIT[1] + SIG_GAP_BELOW_BOX;
}

function formatCurrency(amount: number, currency: string): string {
  const upper = (currency || "INR").toUpperCase();
  const n = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  if (upper === "INR") return `₹${n}`;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: upper,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${upper} ${n}`;
  }
}

function dateOrPlaceholder(value: Date | string | null): string {
  if (!value) return "[Date]";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

async function tryLoadSignatureBuffer(
  blobPath: string | null,
  blobContainer: string | null,
): Promise<Buffer | null> {
  if (!blobPath) return null;
  const container = resolveSignatureDownloadContainer(blobPath, blobContainer);
  try {
    return await downloadBlobBuffer(container, blobPath);
  } catch {
    return null;
  }
}

/**
 * Render the consolidated 11-section service agreement to a PDF buffer.
 * Mirrors the structure rendered by the frontend AgreementPreview component
 * so the on-screen preview, the email recipient view, and the saved PDF stay
 * in lockstep.
 */
export async function generateAgreementPdf(
  organizationId: string,
  agreementId: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const agreement = await findAgreementById(pool, organizationId, agreementId);
  if (!agreement) throw new HttpError(404, "Agreement not found.");

  const project = await findAgencyProjectById(pool, organizationId, agreement.project_id);
  if (!project) throw new HttpError(404, "Project not found.");

  const [deliverables, paymentTerm, milestones, signatures, clients] = await Promise.all([
    listDeliverables(pool, agreementId),
    findPaymentTermsByAgreement(pool, agreementId),
    listMilestonesByAgreement(pool, agreementId),
    listSignaturesByAgreement(pool, agreementId),
    listClientsForProject(pool, organizationId, agreement.project_id),
  ]);

  const currency = project.currency || "INR";

  const doc = createPdfDocument({ size: "A4", margin: 56 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));

  const writeHeading = (text: string): void => {
    doc.moveDown(0.6).font(PDF_FONT_BOLD).fontSize(12).text(text);
    doc.moveDown(0.2);
  };

  const writeBody = (text: string): void => {
    doc.font(PDF_FONT).fontSize(10).text(text, { align: "left" });
  };

  // Title
  doc.font(PDF_FONT_BOLD).fontSize(18).text("SERVICE AGREEMENT", { align: "center" });
  doc.moveDown(0.5);
  doc.font(PDF_FONT).fontSize(10).text(
    `This Agreement is entered into between ${agreement.service_provider_name} ("Service Provider") and Client on ${dateOrPlaceholder(agreement.agreement_date)}.`,
    { align: "left" },
  );

  // Section 1: Scope of Work
  writeHeading("1. Scope of Work");
  writeBody(`Service Type: ${agreement.service_type}`);
  if (deliverables.length > 0) {
    doc.moveDown(0.3).font(PDF_FONT_BOLD).fontSize(10).text("Deliverables:");
    doc.font(PDF_FONT).fontSize(10);
    deliverables
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .forEach((d, idx) => doc.text(`${idx + 1}. ${d.description}`, { indent: 16 }));
  }
  doc.moveDown(0.3);
  writeBody(
    "Any additional features, integrations, or changes not explicitly listed above are outside the scope of this Agreement and may require a separate quotation or amendment.",
  );

  // Section 2: Timeline & Milestones
  writeHeading("2. Timeline & Milestones");
  writeBody(`Start Date: ${dateOrPlaceholder(agreement.start_date)}`);
  writeBody(`Estimated Completion: ${dateOrPlaceholder(agreement.end_date)}`);
  if (agreement.duration && agreement.duration_unit) {
    writeBody(`Total Duration: ${agreement.duration} ${agreement.duration_unit}`);
  }
  writeBody(
    "Timelines are estimates and may shift based on the timely receipt of content, feedback, and approvals from the Client. Delays caused by the Client will not be the responsibility of the Service Provider.",
  );

  // Section 3: Payment Terms
  writeHeading("3. Payment Terms");
  PAYMENT_STRUCTURE_LABELS.forEach(({ key, label }) => {
    const checked = paymentTerm?.payment_structure === key;
    writeBody(`${checked ? "[x]" : "[ ]"} ${label}`);
  });
  if (paymentTerm?.payment_structure === "milestone-based" && milestones.length > 0) {
    doc.moveDown(0.3).font(PDF_FONT_BOLD).fontSize(10).text("Milestones:");
    doc.font(PDF_FONT).fontSize(10);
    const sorted: AgreementMilestoneRow[] = milestones
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);
    sorted.forEach((m) => {
      doc.text(
        `- ${m.description} - ${formatCurrency(Number(m.amount), currency)} (Due: ${m.milestone_date_str ?? "[Date]"})`,
        { indent: 16 },
      );
    });
  }
  if (paymentTerm?.payment_method) {
    doc.moveDown(0.3);
    writeBody(`Payment Method: ${paymentTerm.payment_method}`);
  }
  doc.moveDown(0.3);
  writeBody(
    "Work will commence only after receipt of any applicable upfront payment. Late payments may result in work being paused until the outstanding balance is cleared.",
  );

  // Section 4: Revisions
  writeHeading("4. Revisions");
  writeBody(`Up to ${agreement.number_of_revisions} revisions are included.`);
  writeBody(
    "A revision means minor adjustments within the agreed scope of work. A complete redesign or change of direction will be treated as new work and billed separately.",
  );

  // Section 5: Client Responsibilities
  writeHeading("5. Client Responsibilities");
  writeBody("- Provide all required content, materials, and feedback in a timely manner.");
  writeBody("- Review and approve deliverables within a reasonable time.");
  writeBody(
    "- Ensure that all materials supplied to the Service Provider do not infringe on any third-party rights.",
  );

  // Section 6: Ownership & Usage Rights
  writeHeading("6. Ownership & Usage Rights");
  writeBody(
    "All intellectual property rights in the deliverables transfer to the Client upon receipt of full payment. The Service Provider retains the right to display the work in its portfolio unless agreed otherwise in writing.",
  );

  // Section 7: Confidentiality
  writeHeading("7. Confidentiality");
  writeBody(
    "Both parties agree to keep confidential any non-public information shared during the course of this engagement and to use such information solely for the purpose of fulfilling the obligations under this Agreement.",
  );

  // Section 8: Termination
  writeHeading("8. Termination");
  writeBody(
    "Either party may terminate this Agreement with written notice. Payments for completed work are non-refundable. Upon settlement of any outstanding dues, the Service Provider will hand over completed deliverables.",
  );

  // Section 9: Limitation of Liability
  writeHeading("9. Limitation of Liability");
  writeBody(
    "The Service Provider shall not be liable for any lost business or revenue, third-party tools or hosting issues, or delays caused by the Client.",
  );

  // Section 10: Governing Law
  writeHeading("10. Governing Law");
  writeBody(`Governing Law / Jurisdiction: ${agreement.jurisdiction || "[Jurisdiction / Country]"}`);
  doc.moveDown(0.45);

  // Section 11: Acceptance & E-Signature
  writeHeading("11. Acceptance & E-Signature");
  doc.moveDown(0.25);

  const sigByType = (type: "service_provider" | "client", clientId: string | null = null) =>
    signatures.find(
      (s: AgreementSignatureRow) =>
        s.signer_type === type && (clientId === null || s.client_id === clientId),
    );

  doc.font(PDF_FONT_BOLD).fontSize(10).text("Service Provider");
  doc.moveDown(0.35);
  const spSig = sigByType("service_provider");
  if (spSig) {
    const buf = await tryLoadSignatureBuffer(spSig.signature_image_path, spSig.blob_container);
    if (buf) {
      try {
        drawSignatureImageInFlow(doc, buf);
      } catch {
        /* ignore image render failures */
      }
    }
    doc.moveDown(0.15);
    doc.font(PDF_FONT).fontSize(10).text(spSig.signer_name);
    doc.moveDown(0.2);
    doc.text(`Signed at: ${spSig.signed_at.toISOString()}`);
    doc.moveDown(0.2);
    if (spSig.document_id) doc.text(`Document ID: ${spSig.document_id}`);
  } else {
    doc.font(PDF_FONT).fontSize(10).text("[Service Provider signature pending]");
  }

  doc.moveDown(1);
  doc.font(PDF_FONT_BOLD).fontSize(10).text("Client(s)");
  doc.moveDown(0.35);
  if (clients.length === 0) {
    doc.font(PDF_FONT).fontSize(10).text("[No clients assigned]");
  } else {
    for (const c of clients) {
      doc.moveDown(0.55);
      doc.font(PDF_FONT_BOLD).fontSize(10).text(c.name);
      doc.moveDown(0.3);
      const cSig = sigByType("client", c.id);
      if (cSig) {
        const buf = await tryLoadSignatureBuffer(cSig.signature_image_path, cSig.blob_container);
        if (buf) {
          try {
            drawSignatureImageInFlow(doc, buf);
          } catch {
            /* ignore */
          }
        }
        doc.moveDown(0.15);
        doc.font(PDF_FONT).fontSize(10).text(cSig.signer_name);
        doc.moveDown(0.2);
        doc.text(`Signed at: ${cSig.signed_at.toISOString()}`);
      } else {
        doc.font(PDF_FONT).fontSize(10).text("[Pending signature]");
      }
    }
  }

  doc.end();
  await done;

  const buffer = Buffer.concat(chunks);
  const filename = `agreement-${agreement.id}.pdf`;
  return { buffer, filename };
}
