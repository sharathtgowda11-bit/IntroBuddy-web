import { withTenant } from "@introbuddy/db";
import type { Role } from "@introbuddy/shared";
import type { Pool, PoolClient } from "pg";
import { createCollegeUser, findCollegeUserByEmail } from "./collegeUsers.js";
import { createIdentity } from "./identity.js";
import { createInvitation, revokeOpenInvitationsForCollegeUser } from "./invitationsTable.js";
import { generateRawToken, hashToken } from "./tokens.js";

const INVITATION_EXPIRY_DAYS = 7; // spec 10.5

export interface ResolveCollegeUserParams {
  tenantId: string;
  email: string;
  role: Role;
  name?: string | null;
  usn?: string | null;
  degreeId?: string | null;
  departmentId?: string | null;
  graduationYear?: number | null;
  /** Set only by the bulk-import commit job -- which import created this row, for invitationsSend's later lookup. */
  sourceImportJobId?: string | null;
}

export type ResolveCollegeUserResult = { conflict: true } | { conflict: false; collegeUserId: string };

/**
 * The "find-existing-or-create-identity-and-college_users-row" half of
 * provisioning -- always eager, never deferred, because
 * college_users.user_id is NOT NULL REFERENCES auth.users(id): a row
 * can't exist without a real identity first. This is what Milestone 4's
 * bulk-import commit job calls per row (creating the account) while
 * leaving the invitation token and email for a separate, later,
 * throttled step -- mintInvitationToken below.
 */
export async function resolveCollegeUserForInvite(
  client: PoolClient,
  pool: Pool,
  params: ResolveCollegeUserParams,
): Promise<ResolveCollegeUserResult> {
  const { tenantId, email, role, name, usn, degreeId, departmentId, graduationYear, sourceImportJobId } = params;

  const existing = await findCollegeUserByEmail(client, email);
  if (existing && existing.status === "active") {
    return { conflict: true };
  }
  if (existing) {
    return { conflict: false, collegeUserId: existing.id };
  }

  const userId = await createIdentity(pool, email);
  const collegeUserId = await createCollegeUser(client, {
    tenantId,
    userId,
    email,
    name,
    usn,
    role,
    degreeId,
    departmentId,
    graduationYear,
    sourceImportJobId,
  });
  return { conflict: false, collegeUserId };
}

export interface MintInvitationTokenParams {
  tenantId: string;
  collegeUserId: string;
  invitedByCollegeUserId: string | null;
}

/**
 * The "revoke old + create new invitation" half -- deferred and chunked
 * for bulk imports (spec 10.7's throttling requirement), immediate for
 * single add, college creation, and the super-admin bootstrap.
 */
export async function mintInvitationToken(client: PoolClient, params: MintInvitationTokenParams): Promise<string> {
  await revokeOpenInvitationsForCollegeUser(client, params.collegeUserId);

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await createInvitation(client, {
    tenantId: params.tenantId,
    collegeUserId: params.collegeUserId,
    tokenHash,
    invitedBy: params.invitedByCollegeUserId,
    expiresAt,
  });

  return rawToken;
}

export interface ProvisionInvitationParams {
  /**
   * The tenant this invitation belongs to -- NOT necessarily the
   * caller's own session tenant. POST /invitations passes the caller's
   * session.tenantId; POST /colleges and the super-admin bootstrap
   * script both pass a tenant id the caller doesn't belong to.
   */
  tenantId: string;
  email: string;
  role: Role;
  name?: string | null;
  usn?: string | null;
  degreeId?: string | null;
  departmentId?: string | null;
  graduationYear?: number | null;
  /** null only for the system bootstrap, which has no human inviter. */
  invitedByCollegeUserId: string | null;
}

export type ProvisionInvitationResult = { conflict: true } | { conflict: false; rawToken: string };

/**
 * Composes both halves for the immediate, one-shot case -- single
 * student add, college creation, super-admin bootstrap. Identical
 * external signature and behavior to the pre-Milestone-4 version; every
 * caller only changes its import path, per the M2/M3 e2e tests that
 * verify this directly.
 *
 * Must be called from inside a withTenant(pool, params.tenantId, ...)
 * transaction if the caller is composing this with other writes in the
 * same transaction (e.g. POST /colleges also inserts the tenant row and
 * an audit_log entry); callers that only need this one operation can use
 * provisionInvitation() below, which opens its own transaction.
 */
export async function provisionInvitationInTransaction(
  pool: Pool,
  client: PoolClient,
  params: ProvisionInvitationParams,
): Promise<ProvisionInvitationResult> {
  const resolved = await resolveCollegeUserForInvite(client, pool, params);
  if (resolved.conflict) {
    return { conflict: true };
  }
  const rawToken = await mintInvitationToken(client, {
    tenantId: params.tenantId,
    collegeUserId: resolved.collegeUserId,
    invitedByCollegeUserId: params.invitedByCollegeUserId,
  });
  return { conflict: false, rawToken };
}

/** Convenience wrapper for callers that aren't composing this with other writes in the same transaction. */
export async function provisionInvitation(pool: Pool, params: ProvisionInvitationParams): Promise<ProvisionInvitationResult> {
  return withTenant(pool, params.tenantId, (client) => provisionInvitationInTransaction(pool, client, params));
}
