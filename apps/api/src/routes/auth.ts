import { getPool, withTenant } from "@introbuddy/db";
import {
  ActivateRequestSchema,
  AdminLoginRequestSchema,
  LoginRequestSchema,
  PasswordResetCompleteSchema,
  PasswordResetRequestSchema,
} from "@introbuddy/shared";
import {
  decodeCompoundToken,
  encodeCompoundToken,
  findCollegeUserByEmail,
  findCollegeUserById,
  findCollegeUserByUsn,
  generateRawToken,
  hashToken,
  markCollegeUserActive,
  consumeInvitation,
  findActiveInvitationByTokenHash,
} from "@introbuddy/invitations";
import { Router } from "express";
import { getEnv } from "../env.js";
import { recordConsent } from "../db/consents.js";
import {
  consumePasswordReset,
  createPasswordReset,
  findActivePasswordResetByTokenHash,
  revokeOpenPasswordResetsForCollegeUser,
} from "../db/passwordResets.js";
import { createSession, revokeAllSessionsForCollegeUser } from "../db/sessions.js";
import { findOrCreatePlatformTenant, findTenantById, findTenantBySlug } from "../db/tenants.js";
import { isPasswordBreached } from "../lib/breachedPassword.js";
import {
  sendAlumniActivationConfirmedEmail,
  sendPasswordResetEmail,
  sendStudentActivationConfirmedEmail,
} from "../lib/email.js";
import { verifyPassword, setPassword } from "../lib/supabaseAuth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { resolveSession } from "../middleware/resolveSession.js";

export const authRouter = Router();

const SESSION_EXPIRY_HOURS = 24;
const RESET_EXPIRY_HOURS = 1; // spec 10.5
const AUTH_RATE_LIMIT = { limit: 10, windowSeconds: 15 * 60 }; // spec 14.1 #14

function byIp(routeName: string) {
  return rateLimit({ keyFn: (req) => `${routeName}:${req.ip}`, ...AUTH_RATE_LIMIT });
}

function findByEmailOrUsn(tenantId: string, emailOrUsn: string) {
  const pool = getPool();
  const isEmail = emailOrUsn.includes("@");
  return withTenant(pool, tenantId, (client) =>
    isEmail ? findCollegeUserByEmail(client, emailOrUsn) : findCollegeUserByUsn(client, emailOrUsn),
  );
}

authRouter.post("/activate", byIp("activate"), async (req, res) => {
  const parsed = ActivateRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request" });
    return;
  }

  const decoded = decodeCompoundToken(parsed.data.token);
  if (!decoded) {
    res.status(400).json({ error: "invalid or expired token" });
    return;
  }

  if (await isPasswordBreached(parsed.data.password)) {
    res.status(400).json({ error: "password appears in a known data breach; choose another" });
    return;
  }

  const tokenHash = hashToken(decoded.rawToken);
  const pool = getPool();

  try {
    const outcome = await withTenant(pool, decoded.tenantId, async (client) => {
      const invitation = await findActiveInvitationByTokenHash(client, tokenHash);
      if (!invitation || invitation.tenantId !== decoded.tenantId) {
        return { ok: false as const, reason: "invalid_token" as const };
      }

      const collegeUser = await findCollegeUserById(client, invitation.collegeUserId);
      if (!collegeUser) {
        return { ok: false as const, reason: "invalid_token" as const };
      }

      // Consent (spec 3.4/8.4/14.1 #12) is student-only originally, widened
      // in Phase 2 to also cover alumni: alumni data is uploaded by the
      // college without their consent too, and the same DPDP-style
      // obligation applies equally. Omitting it rolls back the whole
      // transaction, so the single-use token stays valid for a retry.
      if ((collegeUser.role === "student" || collegeUser.role === "alumni") && parsed.data.consentAccepted !== true) {
        return { ok: false as const, reason: "consent_required" as const };
      }

      await consumeInvitation(client, invitation.id);
      await markCollegeUserActive(client, collegeUser.id);

      if (collegeUser.role === "student" || collegeUser.role === "alumni") {
        // Atomic with markCollegeUserActive, same principle as ADR 0008
        // (audit log atomic with its action).
        await recordConsent(client, decoded.tenantId, collegeUser.id);
      }

      const tenant = await findTenantById(client, decoded.tenantId);

      return { ok: true as const, userId: collegeUser.userId, collegeUser, tenant };
    });

    if (!outcome.ok) {
      if (outcome.reason === "consent_required") {
        res.status(400).json({ error: "consent must be accepted to activate this account" });
        return;
      }
      res.status(400).json({ error: "invalid or expired token" });
      return;
    }

    await setPassword(outcome.userId, parsed.data.password);

    if (outcome.collegeUser.role === "student") {
      const env = getEnv();
      const firstName = outcome.collegeUser.name?.split(" ")[0] || "there";
      await sendStudentActivationConfirmedEmail({
        to: outcome.collegeUser.email,
        firstName,
        collegeName: outcome.tenant?.name ?? "your college",
        profileUrl: `${env.WEB_APP_URL}/profile`,
        collegeAdminEmail: outcome.tenant?.contactEmail ?? null,
      });
    } else if (outcome.collegeUser.role === "alumni") {
      // Points at the 3-step profile setup instead of a single profile
      // page (Part 9.3).
      const env = getEnv();
      const firstName = outcome.collegeUser.name?.split(" ")[0] || "there";
      await sendAlumniActivationConfirmedEmail({
        to: outcome.collegeUser.email,
        firstName,
        collegeName: outcome.tenant?.name ?? "your college",
        profileUrl: `${env.WEB_APP_URL}/alumni/profile`,
        collegeAdminEmail: outcome.tenant?.contactEmail ?? null,
      });
    }

    res.status(200).json({ status: "activated" });
  } catch (error) {
    console.error("activation failed", error);
    res.status(500).json({ error: "internal error" });
  }
});

authRouter.post("/login", byIp("login"), async (req, res) => {
  const parsed = LoginRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request" });
    return;
  }
  const { tenantSlug, emailOrUsn, password } = parsed.data;
  const pool = getPool();

  // Enumeration resistance (spec 8.5): an unknown tenant, an unknown
  // USN/email, and a wrong password all reach this exact same response.
  const genericFailure = () => res.status(401).json({ error: "invalid credentials" });

  try {
    const tenant = await findTenantBySlug(pool, tenantSlug);
    if (!tenant) {
      genericFailure();
      return;
    }

    const collegeUser = await findByEmailOrUsn(tenant.id, emailOrUsn);
    if (!collegeUser || collegeUser.status !== "active") {
      genericFailure();
      return;
    }

    const passwordOk = await verifyPassword(collegeUser.email, password);
    if (!passwordOk) {
      genericFailure();
      return;
    }

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000);

    await withTenant(pool, tenant.id, (client) =>
      createSession(client, { tenantId: tenant.id, collegeUserId: collegeUser.id, tokenHash, expiresAt }),
    );

    res.status(200).json({ token: encodeCompoundToken(tenant.id, rawToken) });
  } catch (error) {
    console.error("login failed", error);
    genericFailure();
  }
});

/**
 * The private super_admin login (spec: "Private Super Admin Portal"). Unlike
 * /auth/login, the tenant is never client-supplied -- there is exactly one
 * possible tenant for a super_admin (the sentinel "platform" tenant), so the
 * server resolves it itself via the same findOrCreatePlatformTenant() used
 * at bootstrap time, instead of trusting a tenantSlug the client would
 * otherwise have to know or guess. Session issuance below is byte-for-byte
 * the same as /auth/login's (createSession, encodeCompoundToken) -- a
 * session minted here is indistinguishable to resolveSession()/RLS from one
 * minted by the generic route.
 *
 * The explicit role check is a second, independent guarantee on top of the
 * "platform tenant only ever contains super_admin rows" invariant -- even if
 * that invariant were ever violated, this route still could not authenticate
 * a non-super_admin.
 */
authRouter.post("/admin-login", byIp("admin-login"), async (req, res) => {
  const parsed = AdminLoginRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request" });
    return;
  }
  const { email, password } = parsed.data;
  const pool = getPool();

  // Same enumeration-resistant shape as /auth/login: unknown email, wrong
  // role, and wrong password all reach this exact same response.
  const genericFailure = () => res.status(401).json({ error: "invalid credentials" });

  try {
    const platformTenant = await findOrCreatePlatformTenant(pool);

    const collegeUser = await withTenant(pool, platformTenant.id, (client) =>
      findCollegeUserByEmail(client, email),
    );
    if (!collegeUser || collegeUser.status !== "active" || collegeUser.role !== "super_admin") {
      genericFailure();
      return;
    }

    const passwordOk = await verifyPassword(collegeUser.email, password);
    if (!passwordOk) {
      genericFailure();
      return;
    }

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000);

    await withTenant(pool, platformTenant.id, (client) =>
      createSession(client, { tenantId: platformTenant.id, collegeUserId: collegeUser.id, tokenHash, expiresAt }),
    );

    res.status(200).json({ token: encodeCompoundToken(platformTenant.id, rawToken) });
  } catch (error) {
    console.error("admin login failed", error);
    genericFailure();
  }
});

/**
 * "Whoami" -- the frontend needs to know who's logged in (role, tenant)
 * both right after login and on every page reload, since /auth/login's
 * own response is deliberately just a bearer token. No specific
 * permission gate: any authenticated role may read its own session.
 */
authRouter.get("/session", resolveSession(), async (req, res) => {
  const session = req.session!;
  const pool = getPool();

  try {
    const { collegeUser, tenant } = await withTenant(pool, session.tenantId, async (client) => {
      const collegeUser = await findCollegeUserById(client, session.collegeUserId);
      const tenant = await findTenantById(client, session.tenantId);
      return { collegeUser, tenant };
    });

    if (!collegeUser) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    res.status(200).json({
      tenantId: session.tenantId,
      tenantSlug: tenant?.slug ?? null,
      collegeUserId: session.collegeUserId,
      role: session.role,
      email: collegeUser.email,
      name: collegeUser.name,
    });
  } catch (error) {
    console.error("failed to resolve session", error);
    res.status(500).json({ error: "internal error" });
  }
});

authRouter.post("/reset/request", byIp("reset-request"), async (req, res) => {
  const parsed = PasswordResetRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request" });
    return;
  }
  const { tenantSlug, emailOrUsn } = parsed.data;
  const pool = getPool();
  const env = getEnv();

  // Always identical response, regardless of match (spec 8.6).
  const genericResponse = () => res.status(200).json({ status: "if an account exists, an email has been sent" });

  try {
    const tenant = await findTenantBySlug(pool, tenantSlug);
    if (!tenant) {
      genericResponse();
      return;
    }

    const collegeUser = await findByEmailOrUsn(tenant.id, emailOrUsn);
    if (!collegeUser) {
      genericResponse();
      return;
    }

    // Never activated: silently send an activation email instead of a
    // reset link, without revealing this distinction to the caller.
    if (collegeUser.status === "invited") {
      genericResponse();
      return;
    }

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_EXPIRY_HOURS * 60 * 60 * 1000);

    await withTenant(pool, tenant.id, async (client) => {
      await revokeOpenPasswordResetsForCollegeUser(client, collegeUser.id);
      await createPasswordReset(client, {
        tenantId: tenant.id,
        collegeUserId: collegeUser.id,
        tokenHash,
        expiresAt,
      });
    });

    const resetUrl = `${env.WEB_APP_URL}/reset-password?token=${encodeCompoundToken(tenant.id, rawToken)}`;
    await sendPasswordResetEmail({ to: collegeUser.email, resetUrl });

    genericResponse();
  } catch (error) {
    console.error("password reset request failed", error);
    genericResponse();
  }
});

authRouter.post("/reset/complete", byIp("reset-complete"), async (req, res) => {
  const parsed = PasswordResetCompleteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request" });
    return;
  }

  const decoded = decodeCompoundToken(parsed.data.token);
  if (!decoded) {
    res.status(400).json({ error: "invalid or expired token" });
    return;
  }

  if (await isPasswordBreached(parsed.data.password)) {
    res.status(400).json({ error: "password appears in a known data breach; choose another" });
    return;
  }

  const tokenHash = hashToken(decoded.rawToken);
  const pool = getPool();

  try {
    const outcome = await withTenant(pool, decoded.tenantId, async (client) => {
      const reset = await findActivePasswordResetByTokenHash(client, tokenHash);
      if (!reset || reset.tenantId !== decoded.tenantId) {
        return { ok: false as const };
      }
      const collegeUser = await findCollegeUserById(client, reset.collegeUserId);
      if (!collegeUser) {
        return { ok: false as const };
      }
      await consumePasswordReset(client, reset.id);
      await revokeAllSessionsForCollegeUser(client, collegeUser.id);
      return { ok: true as const, userId: collegeUser.userId };
    });

    if (!outcome.ok) {
      res.status(400).json({ error: "invalid or expired token" });
      return;
    }

    await setPassword(outcome.userId, parsed.data.password);
    res.status(200).json({ status: "reset" });
  } catch (error) {
    console.error("password reset completion failed", error);
    res.status(500).json({ error: "internal error" });
  }
});
