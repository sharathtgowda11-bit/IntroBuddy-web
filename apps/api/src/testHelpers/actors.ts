import { createFixtureCollegeUser, withTenant, type FixtureCollegeUser } from "@introbuddy/db";
import { encodeCompoundToken, generateRawToken, hashToken } from "@introbuddy/invitations";
import type { Client, Pool } from "pg";
import { createSession } from "../db/sessions.js";

export interface FixtureActor {
  collegeUserId: string;
  userId: string;
  email: string;
  authHeader: string;
}

/**
 * Creates an active college_user plus a real session row directly,
 * bypassing /auth/login -- for tests that need an already-authenticated
 * caller (e.g. to create an invitation) without testing login itself.
 */
export async function createFixtureActor(
  superuser: Client,
  pool: Pool,
  tenantId: string,
  params: Omit<FixtureCollegeUser, "tenantId"> = {},
): Promise<FixtureActor> {
  const { collegeUserId, userId, email } = await createFixtureCollegeUser(superuser, {
    tenantId,
    status: "active",
    ...params,
  });

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await withTenant(pool, tenantId, (client) =>
    createSession(client, { tenantId, collegeUserId, tokenHash, expiresAt }),
  );

  return {
    collegeUserId,
    userId,
    email,
    authHeader: `Bearer ${encodeCompoundToken(tenantId, rawToken)}`,
  };
}
