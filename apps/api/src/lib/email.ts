import nodemailer, { type Transporter } from "nodemailer";
import { getEnv } from "../env.js";

let transporter: Transporter | undefined;

/**
 * Generic SMTP transport, not a specific provider's SDK -- switching from
 * local Mailpit to Resend/SES/Postmark later is an env-var change, not a
 * code change (ADR 0005).
 *
 * As of Milestone 4, sendInvitationEmail lives in @introbuddy/invitations
 * with its own, separate transporter instance -- it's the one bulk-sending
 * actually needs (spec 10.7's throttling). Neither of the two templates
 * remaining here has that burst-volume concern: a college gets one admin
 * invite ever, and a password reset is one-at-a-time and user-initiated.
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

export interface SendCollegeAdminInvitationEmailParams {
  to: string;
  collegeName: string;
  tenantSlug: string;
  activationUrl: string;
}

/**
 * A separate, focused template rather than overloading
 * sendInvitationEmail with a sometimes-used parameter. States the tenant
 * slug explicitly: activation doesn't need it (it's embedded in the
 * compound token), but every subsequent /auth/login call does (ADR
 * 0002), and there's no other way for a new college admin to discover it.
 */
export async function sendCollegeAdminInvitationEmail({
  to,
  collegeName,
  tenantSlug,
  activationUrl,
}: SendCollegeAdminInvitationEmailParams): Promise<void> {
  const env = getEnv();
  await getTransporter().sendMail({
    from: env.SMTP_FROM,
    to,
    subject: `Set up ${collegeName} on IntroBuddy`,
    text: `An IntroBuddy account has been created for ${collegeName}.\n\nTo get started, set your password and complete your college profile:\n${activationUrl}\n\nThis link works once and expires in 7 days.\n\nYour college's sign-in code is: ${tenantSlug}\nYou'll need it every time you log in, so keep it handy.\n\nIf you were not expecting this email, please ignore it.`,
  });
}

export interface SendPasswordResetEmailParams {
  to: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail({ to, resetUrl }: SendPasswordResetEmailParams): Promise<void> {
  const env = getEnv();
  await getTransporter().sendMail({
    from: env.SMTP_FROM,
    to,
    subject: "Reset your IntroBuddy password",
    text: `We received a request to reset your IntroBuddy password.\n\nReset your password:\n${resetUrl}\n\nThis link expires in 1 hour and can be used once.\n\nIf you did not request this, you can safely ignore this email. Your password has not changed.`,
  });
}

export interface SendStudentActivationConfirmedEmailParams {
  to: string;
  firstName: string;
  collegeName: string;
  profileUrl: string;
  collegeAdminEmail: string | null;
}

/**
 * Spec's Message 5 -- sent once, right after a student's own activation
 * (setPassword) succeeds, never for college_admin/super_admin. This is a
 * security message as much as a welcome: the final paragraph is how a
 * student would learn their account had been taken over by someone else.
 */
export async function sendStudentActivationConfirmedEmail({
  to,
  firstName,
  collegeName,
  profileUrl,
  collegeAdminEmail,
}: SendStudentActivationConfirmedEmailParams): Promise<void> {
  const env = getEnv();
  const contactLine = collegeAdminEmail
    ? `If you did not set this password, contact your placement office immediately at ${collegeAdminEmail}.`
    : "If you did not set this password, contact your placement office immediately.";
  await getTransporter().sendMail({
    from: env.SMTP_FROM,
    to,
    subject: `Your ${collegeName} account is active`,
    text: `Hi ${firstName},\n\nYour IntroBuddy account is now active.\n\nNext step: complete your profile. You will need a profile photo and your LinkedIn URL - these are required before you can connect with alumni.\n\n${profileUrl}\n\n${contactLine}`,
  });
}

export interface SendAlumniActivationConfirmedEmailParams {
  to: string;
  firstName: string;
  collegeName: string;
  profileUrl: string;
  collegeAdminEmail: string | null;
}

/**
 * Phase 2, Part 9.3 -- alumni-appropriate variant of the student
 * activation-confirmed email above, sent once right after an alumnus's
 * own activation (setPassword) succeeds. Points at the 3-step profile
 * setup rather than a single profile page, since posting opportunities
 * and receiving requests both require a complete profile first.
 */
export async function sendAlumniActivationConfirmedEmail({
  to,
  firstName,
  collegeName,
  profileUrl,
  collegeAdminEmail,
}: SendAlumniActivationConfirmedEmailParams): Promise<void> {
  const env = getEnv();
  const contactLine = collegeAdminEmail
    ? `If you did not set this password, contact your placement office immediately at ${collegeAdminEmail}.`
    : "If you did not set this password, contact your placement office immediately.";
  await getTransporter().sendMail({
    from: env.SMTP_FROM,
    to,
    subject: `Your ${collegeName} alumni account is active`,
    text: `Hi ${firstName},\n\nYour IntroBuddy alumni account is now active.\n\nNext step: complete your 3-step profile. You will need a profile photo, your LinkedIn URL, and a few details about your current role - these are required before students can find you or send you a request.\n\n${profileUrl}\n\n${contactLine}`,
  });
}
