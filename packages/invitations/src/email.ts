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

export interface StudentInvitationDetails {
  name: string | null;
  usn: string | null;
  departmentName: string | null;
  graduationYear: number | null;
}

export interface SendInvitationEmailParams {
  to: string;
  activationUrl: string;
  role: string;
  /** Only meaningful when role === "student" -- see the personalized branch below. */
  collegeName?: string;
  student?: StudentInvitationDetails;
}

/**
 * Spec's Message 2 when role is "student" and both collegeName and
 * student details are supplied -- shows the student their own USN and
 * department, the fastest way to distinguish a legitimate message from a
 * phishing attempt, and it surfaces import errors immediately. Falls back
 * to the generic template otherwise (college_admin/super_admin invites,
 * or any caller not yet passing the extra context) so nothing breaks by
 * omission.
 */
export async function sendInvitationEmail({
  to,
  activationUrl,
  role,
  collegeName,
  student,
}: SendInvitationEmailParams): Promise<void> {
  const from = process.env.SMTP_FROM;
  if (!from) {
    throw new Error("SMTP_FROM must be set");
  }

  if (role === "student" && collegeName && student) {
    const firstName = student.name?.split(" ")[0] || "there";
    await getTransporter().sendMail({
      from,
      to,
      subject: `${firstName}, activate your ${collegeName} alumni account`,
      text: `Hi ${firstName},\n\n${collegeName} has created an account for you on IntroBuddy - a platform where you can connect with alumni from your college for mentorship, career guidance, and referrals.\n\nYour details:\n  Name: ${student.name ?? "N/A"}\n  USN: ${student.usn ?? "N/A"}\n  Department: ${student.departmentName ?? "N/A"}\n  Batch: ${student.graduationYear ?? "N/A"}\n\nSet your password to activate your account:\n${activationUrl}\n\nThis link works once and expires in 7 days.\n\nIf any of the details above are wrong, reply to this email and your placement office will correct them.\n\n- ${collegeName} Placement Cell\n  Sent via IntroBuddy`,
    });
    return;
  }

  await getTransporter().sendMail({
    from,
    to,
    subject: "You've been invited to IntroBuddy",
    text: `You've been invited to join IntroBuddy as a ${role}.\n\nActivate your account:\n${activationUrl}\n\nThis link works once and expires in 7 days.\n\nIf you were not expecting this email, please ignore it.`,
  });
}

export interface SendImportSummaryEmailParams {
  to: string;
  adminFirstName: string;
  collegeName: string;
  fileName: string;
  createdCount: number;
  updatedCount: number;
  errorCount: number;
  errorReportUrl: string;
  reviewUrl: string;
}

/**
 * Spec's Message 4 -- sent once, when apps/worker's import.commit job
 * reaches its final chunk. The last paragraph is load-bearing (spec's
 * own words): it makes explicit that importing and inviting are separate
 * actions, so an admin doesn't assume the import already emailed everyone.
 */
export async function sendImportSummaryEmail({
  to,
  adminFirstName,
  collegeName,
  fileName,
  createdCount,
  updatedCount,
  errorCount,
  errorReportUrl,
  reviewUrl,
}: SendImportSummaryEmailParams): Promise<void> {
  const from = process.env.SMTP_FROM;
  if (!from) {
    throw new Error("SMTP_FROM must be set");
  }
  const successCount = createdCount + updatedCount;
  const totalCount = successCount + errorCount;

  const errorParagraph =
    errorCount > 0
      ? `${errorCount} rows could not be imported. Download the error report to see what went wrong and re-upload the corrected file:\n${errorReportUrl}\n\n`
      : "";

  await getTransporter().sendMail({
    from,
    to,
    subject: `Student import complete - ${successCount} of ${totalCount} imported`,
    text: `Hi ${adminFirstName},\n\nYour student import for ${collegeName} has finished.\n\n  File: ${fileName}\n  Created: ${createdCount}\n  Updated: ${updatedCount}\n  Skipped: ${errorCount}\n\n${errorParagraph}No invitation emails have been sent yet. Review the imported students, then send invitations when you are ready:\n${reviewUrl}`,
  });
}
