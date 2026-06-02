import { pool } from "../db/pool.js";
import {
  findInstallmentById,
  updateInstallmentStatus,
} from "../repositories/agencyInstallment.repository.js";
import {
  findAgencyInvoiceById,
  updateAgencyInvoice,
} from "../repositories/agencyInvoice.repository.js";
import { insertNotification } from "../repositories/agencyNotification.repository.js";
import {
  insertPayment,
  listPaymentsByInvoice,
  sumPaymentDeductionsByInvoice,
  sumPaymentsByInstallment,
} from "../repositories/agencyPayment.repository.js";
import {
  toAgencyPaymentDto,
  type AgencyInvoiceStatus,
  type AgencyPaymentDto,
} from "../types/agencyInvoice.js";
import { HttpError } from "../utils/httpError.js";
import type { RecordPaymentInput } from "../validators/agencyInvoice.schema.js";

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function deriveInvoiceStatus(
  amountReceived: number,
  totalPaymentDeductions: number,
  grandTotal: number,
  dueDate: Date,
  currentStatus: AgencyInvoiceStatus,
): AgencyInvoiceStatus {
  if (currentStatus === "cancelled") return currentStatus;
  const settled = round2(amountReceived + totalPaymentDeductions);
  if (round2(settled) >= round2(grandTotal) - 0.01 && grandTotal > 0) return "paid";
  if (amountReceived > 0 || totalPaymentDeductions > 0) return "partial";
  if (dueDate.getTime() < Date.now() && currentStatus !== "draft") return "overdue";
  return currentStatus === "draft" ? "draft" : currentStatus;
}

export async function recordInvoicePaymentService(
  organizationId: string,
  recorderUserId: string,
  invoiceId: string,
  input: RecordPaymentInput,
): Promise<AgencyPaymentDto> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const invoice = await findAgencyInvoiceById(client, organizationId, invoiceId);
    if (!invoice) throw new HttpError(404, "Invoice not found.");
    if (invoice.status === "cancelled") {
      throw new HttpError(409, "Cannot record payment on a cancelled invoice.");
    }

    const grandTotal = round2(Number(invoice.grand_total));
    const receivedSoFar = round2(Number(invoice.amount_received));
    const sumDeductionsBefore = round2(
      await sumPaymentDeductionsByInvoice(client, organizationId, invoiceId),
    );
    const remainingFace = round2(grandTotal - receivedSoFar - sumDeductionsBefore);

    const amount = round2(input.amount);
    const settlementReference = remainingFace;
    const paymentGatewayFee = round2(input.paymentGatewayFee ?? 0);
    const tdsDeducted = round2(input.tdsDeducted ?? 0);
    const otherDeduction = round2(input.otherDeduction ?? 0);
    const thisPaymentFace = round2(amount + paymentGatewayFee + tdsDeducted + otherDeduction);
    if (thisPaymentFace > round2(remainingFace) + 0.01) {
      throw new HttpError(
        400,
        `Payment total (net + deductions) ${thisPaymentFace} exceeds remaining invoice amount ${remainingFace}.`,
      );
    }

    let installmentId: string | null = null;
    if (input.installmentId) {
      const inst = await findInstallmentById(client, organizationId, input.installmentId);
      if (!inst) throw new HttpError(404, "Installment not found.");
      if (inst.invoice_id !== invoiceId) {
        throw new HttpError(400, "Installment belongs to a different invoice.");
      }
      installmentId = inst.id;
    }

    const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();

    const paymentRow = await insertPayment(client, {
      invoiceId,
      organizationId,
      installmentId,
      amount,
      paymentGatewayFee,
      tdsDeducted,
      otherDeduction,
      settlementReferenceAmount: settlementReference,
      method: input.method,
      reference: input.reference ?? null,
      receivedAt,
      notes: input.notes ?? null,
      recordedByOrgUserId: recorderUserId,
    });

    const newReceived = round2(Number(invoice.amount_received) + amount);
    const totalDeductions = round2(
      await sumPaymentDeductionsByInvoice(client, organizationId, invoiceId),
    );
    const newPending = Math.max(0, round2(grandTotal - newReceived - totalDeductions));
    const newStatus = deriveInvoiceStatus(
      newReceived,
      totalDeductions,
      grandTotal,
      invoice.due_date,
      invoice.status,
    );

    await updateAgencyInvoice(client, organizationId, invoiceId, {
      amount_received: newReceived,
      amount_pending: newPending,
      status: newStatus,
    });

    // If this payment fully covered a specific installment, mark it paid.
    if (installmentId) {
      const inst = await findInstallmentById(client, organizationId, installmentId);
      if (inst) {
        const paidForInst = await sumPaymentsByInstallment(client, organizationId, installmentId);
        if (round2(paidForInst) >= round2(Number(inst.amount)) - 0.01) {
          await updateInstallmentStatus(
            client,
            organizationId,
            installmentId,
            "paid",
            receivedAt,
          );
        }
      }
    }

    await insertNotification(client, {
      organizationId,
      userId: null,
      title: `Payment received for ${invoice.invoice_number}`,
      message: `Received ${amount} (${invoice.currency}). Remaining: ${newPending}.`,
      severity: newStatus === "paid" ? "info" : "info",
      relatedEntityType: "invoice",
      relatedEntityId: invoiceId,
    });

    await client.query("COMMIT");
    return toAgencyPaymentDto(paymentRow);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listInvoicePaymentsService(
  organizationId: string,
  invoiceId: string,
): Promise<AgencyPaymentDto[]> {
  const invoice = await findAgencyInvoiceById(pool, organizationId, invoiceId);
  if (!invoice) throw new HttpError(404, "Invoice not found.");
  const rows = await listPaymentsByInvoice(pool, organizationId, invoiceId);
  return rows.map(toAgencyPaymentDto);
}
