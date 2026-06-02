import nodemailer, { type Transporter } from "nodemailer";

import { env } from "../config/env.js";

export type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type MailEnvelope = {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: MailAttachment[];
  replyTo?: string;
};

export type SendMailResult = {
  delivered: boolean;
  messageId: string;
  mode: "smtp" | "stub";
  error?: string;
};

let cachedTransporter: Transporter | null = null;

function buildTransporter(): Transporter | null {
  if (!env.SMTP_HOST) return null;
  cachedTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? (env.SMTP_SECURE ? 465 : 587),
    secure: env.SMTP_SECURE,
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
  });
  return cachedTransporter;
}

export function getTransporter(): Transporter | null {
  if (cachedTransporter) return cachedTransporter;
  return buildTransporter();
}

function formatFromAddress(): string {
  const from = env.SMTP_FROM ?? env.SMTP_USER ?? "no-reply@mudhro.local";
  return `${env.SMTP_FROM_NAME} <${from}>`;
}

/**
 * Send an email via the configured SMTP transport. If SMTP is not configured
 * we fall back to a dev-friendly stub that logs the intent and returns a
 * synthetic message id. This keeps local dev workable without real SMTP.
 */
export async function sendMail(envelope: MailEnvelope): Promise<SendMailResult> {
  const transporter = getTransporter();
  if (!transporter) {
    const stubId = `stub-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    // eslint-disable-next-line no-console
    console.log(
      `[mail:stub] SMTP not configured. Would send to=${Array.isArray(envelope.to) ? envelope.to.join(",") : envelope.to} subject="${envelope.subject}" (messageId=${stubId})`,
    );
    return { delivered: false, messageId: stubId, mode: "stub" };
  }

  try {
    const info = await transporter.sendMail({
      from: formatFromAddress(),
      to: envelope.to,
      cc: envelope.cc,
      bcc: envelope.bcc,
      subject: envelope.subject,
      html: envelope.html,
      text: envelope.text,
      attachments: envelope.attachments,
      replyTo: envelope.replyTo,
    });
    return {
      delivered: true,
      messageId: info.messageId,
      mode: "smtp",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown SMTP error";
    return {
      delivered: false,
      messageId: "",
      mode: "smtp",
      error: message,
    };
  }
}

export function isMailConfigured(): boolean {
  return Boolean(env.SMTP_HOST);
}
