/**
 * Reusable email content builders. Keep these pure (no I/O) so they can be
 * unit-tested deterministically and so that the calling service has full
 * control over delivery (sendMail, retry policy, etc.).
 */

export type AgreementEmailInput = {
  clientFullName: string;
  userFullName: string;
  userPhone?: string;
  userEmail: string;
  agreementLink: string;
  projectName?: string;
};

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  const space = trimmed.indexOf(" ");
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

export function buildAgreementEmail(input: AgreementEmailInput): RenderedEmail {
  const {
    clientFullName,
    userFullName,
    userPhone,
    userEmail,
    agreementLink,
    projectName,
  } = input;

  const projectSuffix = projectName ? ` - ${projectName}` : "";
  const subject = `Service Agreement${projectSuffix} - Action Required`;

  const projectClause = projectName
    ? ` for the project "${projectName}"`
    : "";

  const phoneLineText = userPhone ? `\n📞 ${userPhone}` : "";

  const text = [
    `Hi ${firstName(clientFullName)},`,
    ``,
    `Hope you're doing well.`,
    ``,
    `I'm reaching out to share the service agreement${projectClause} for your review and signature.`,
    ``,
    `Please review the agreement details and sign using the link below:`,
    agreementLink,
    ``,
    `Important: This link will expire in 2 days (48 hours) from the time this email was sent.`,
    ``,
    `If you have any questions or need any clarifications, please feel free to reach out to me.`,
    ``,
    `Thank you for your time and I look forward to working with you.`,
    ``,
    `Warm regards,`,
    userFullName + phoneLineText,
    `📧 ${userEmail}`,
  ].join("\n");

  const linkButton = `
    <p style="margin: 24px 0;">
      <a href="${escapeHtml(agreementLink)}"
         style="display:inline-block;background:#007bff;color:#ffffff;text-decoration:none;
                padding:12px 24px;border-radius:4px;font-weight:600;">
        Review &amp; Sign Agreement
      </a>
    </p>
    <p style="font-size:12px;color:#555;margin:0 0 16px;word-break:break-all;">
      Or paste this link in your browser:<br/>
      <a href="${escapeHtml(agreementLink)}" style="color:#007bff;">${escapeHtml(agreementLink)}</a>
    </p>
  `;

  const phoneLineHtml = userPhone
    ? `<p style="margin:0;">📞 ${escapeHtml(userPhone)}</p>`
    : "";

  const html = `
<div style="font-family: Arial, Helvetica, sans-serif; color:#111; max-width:640px; margin:0 auto; line-height:1.55;">
  <p>Hi ${escapeHtml(firstName(clientFullName))},</p>
  <p>Hope you're doing well.</p>
  <p>
    I'm reaching out to share the service agreement${escapeHtml(projectClause)} for your review and signature.
  </p>
  <p>Please review the agreement details and sign using the link below:</p>
  ${linkButton}
  <p style="background:#fff7cc;border-left:4px solid #f1c40f;padding:10px 14px;color:#664d03;font-weight:700;margin:16px 0;">
    Important: This link will expire in 2 days (48 hours) from the time this email was sent.
  </p>
  <p>
    If you have any questions or need any clarifications, please feel free to reach out to me.
  </p>
  <p>Thank you for your time and I look forward to working with you.</p>
  <p style="margin-top:24px;">Warm regards,</p>
  <p style="margin:0;font-weight:600;">${escapeHtml(userFullName)}</p>
  ${phoneLineHtml}
  <p style="margin:0;">📧 <a href="mailto:${escapeHtml(userEmail)}" style="color:#007bff;">${escapeHtml(userEmail)}</a></p>
</div>
  `.trim();

  return { subject, text, html };
}
