import { getPool, withTenant } from "@introbuddy/db";
import { hasPermission, INVITE_TARGET_PERMISSION, InvitationCreateSchema } from "@introbuddy/shared";
import { Router } from "express";
import { createCollegeUser, findCollegeUserByEmail } from "../db/collegeUsers.js";
import { createInvitation, revokeOpenInvitationsForCollegeUser } from "../db/invitations.js";
import { getEnv } from "../env.js";
import { sendInvitationEmail } from "../lib/email.js";
import { createIdentity } from "../lib/supabaseAuth.js";
import { encodeCompoundToken, generateRawToken, hashToken } from "../lib/tokens.js";
import { resolveSession } from "../middleware/resolveSession.js";

export const invitationsRouter = Router();

const INVITATION_EXPIRY_DAYS = 7; // spec 10.5

invitationsRouter.post("/", resolveSession(), async (req, res) => {
  const parsed = InvitationCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
    return;
  }
  const { email, role, usn } = parsed.data;
  const session = req.session;
  if (!session) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  // Permission depends on the target role in the request body, so this
  // can't be a static requirePermission(...) middleware -- see plan D10:
  // super_admin and college_admin can both invite a college_admin;
  // only college_admin can invite a student.
  if (!hasPermission(session.role, INVITE_TARGET_PERMISSION[role])) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const pool = getPool();
  const env = getEnv();
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  try {
    const result = await withTenant(pool, session.tenantId, async (client) => {
      const existing = await findCollegeUserByEmail(client, email);

      if (existing && existing.status === "active") {
        return { conflict: true as const };
      }

      let collegeUserId: string;
      if (existing) {
        collegeUserId = existing.id;
        await revokeOpenInvitationsForCollegeUser(client, collegeUserId);
      } else {
        const userId = await createIdentity(email);
        collegeUserId = await createCollegeUser(client, {
          tenantId: session.tenantId,
          userId,
          email,
          usn,
          role,
        });
      }

      await createInvitation(client, {
        tenantId: session.tenantId,
        collegeUserId,
        tokenHash,
        invitedBy: session.collegeUserId,
        expiresAt,
      });

      return { conflict: false as const };
    });

    if (result.conflict) {
      res.status(409).json({ error: "an active account already exists for this email" });
      return;
    }

    const activationUrl = `${env.WEB_APP_URL}/activate?token=${encodeCompoundToken(session.tenantId, rawToken)}`;
    await sendInvitationEmail({ to: email, activationUrl, role });

    res.status(201).json({ status: "invited" });
  } catch (error) {
    console.error("failed to create invitation", error);
    res.status(500).json({ error: "internal error" });
  }
});
