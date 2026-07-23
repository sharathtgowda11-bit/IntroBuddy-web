import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | undefined;

/**
 * Generic SMTP transport, not a specific provider's SDK -- switching from
 * local Mailpit to Resend/SES/Postmark later is an env-var change, not a
 * code change (ADR 0005). Reads SMTP_* directly from process.env, same
 * reasoning as identity.ts's getAdminClient: this package has no app of
 * its own, so it trusts the caller's own boot-time validation.
 *
 * This is a separate transporter instance from apps/api's own
 * lib/email.ts (which keeps sendCollegeAdminInvitationEmail and
 * sendPasswordResetEmail, neither of which has this milestone's
 * burst-volume concern) -- a small, deliberate duplication rather than
 * forcing unrelated concerns into this package.
 */
function getTransporter(): Transporter {
  if (!transporter) {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    if (!host || !port) {
      throw new Error("SMTP_HOST and SMTP_PORT must be set");
    }
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      auth: user && pass ? { user, pass } : undefined,
    });
  }
  return transporter;
}

export interface SendInvitationEmailParams {
  to: string;
  activationUrl: string;
  role: string;
}

export async function sendInvitationEmail({ to, activationUrl, role }: SendInvitationEmailParams): Promise<void> {
  const from = process.env.SMTP_FROM;
  if (!from) {
    throw new Error("SMTP_FROM must be set");
  }
  await getTransporter().sendMail({
    from,
    to,
    subject: "You've been invited to IntroBuddy",
    text: `You've been invited to join IntroBuddy as a ${role}.\n\nActivate your account:\n${activationUrl}\n\nThis link works once and expires in 7 days.\n\nIf you were not expecting this email, please ignore it.`,
  });
}
