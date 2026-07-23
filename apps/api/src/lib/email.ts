import nodemailer, { type Transporter } from "nodemailer";
import { getEnv } from "../env.js";

let transporter: Transporter | undefined;

/**
 * Generic SMTP transport, not a specific provider's SDK -- switching from
 * local Mailpit to Resend/SES/Postmark later is an env-var change, not a
 * code change (plan decision D6). Sent synchronously inline for this
 * milestone; queuing through apps/worker's outbox pattern arrives with
 * that app's first real responsibility (bulk import, Milestone 4).
 */
function getTransporter(): Transporter {
  if (!transporter) {
    const env = getEnv();
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export interface SendInvitationEmailParams {
  to: string;
  activationUrl: string;
  role: string;
}

// TODO(M4): move to email_outbox + apps/worker alongside bulk-import email.
export async function sendInvitationEmail({ to, activationUrl, role }: SendInvitationEmailParams): Promise<void> {
  const env = getEnv();
  await getTransporter().sendMail({
    from: env.SMTP_FROM,
    to,
    subject: "You've been invited to IntroBuddy",
    text: `You've been invited to join IntroBuddy as a ${role}.\n\nActivate your account:\n${activationUrl}\n\nThis link works once and expires in 7 days.\n\nIf you were not expecting this email, please ignore it.`,
  });
}

export interface SendPasswordResetEmailParams {
  to: string;
  resetUrl: string;
}

// TODO(M4): move to email_outbox + apps/worker alongside bulk-import email.
export async function sendPasswordResetEmail({ to, resetUrl }: SendPasswordResetEmailParams): Promise<void> {
  const env = getEnv();
  await getTransporter().sendMail({
    from: env.SMTP_FROM,
    to,
    subject: "Reset your IntroBuddy password",
    text: `We received a request to reset your IntroBuddy password.\n\nReset your password:\n${resetUrl}\n\nThis link expires in 1 hour and can be used once.\n\nIf you did not request this, you can safely ignore this email. Your password has not changed.`,
  });
}
