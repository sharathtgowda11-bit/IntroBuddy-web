import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32; // spec 10.5: minimum 32 bytes, cryptographically random.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A raw, single-use token to hand to a user (email link or session credential). Never stored raw. */
export function generateRawToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** The value actually stored in a token_hash column -- raw tokens are never persisted. */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * invitations, password_resets, and sessions all carry the same FORCE RLS
 * policy as college_users -- a lookup can't run before the tenant is
 * known. So every token this app ever hands to a user (an activation
 * link, a reset link, a session credential) is compound:
 * "<tenantId>.<rawToken>". The tenant_id prefix is an untrusted routing
 * hint only, telling the server which RLS partition to query -- it grants
 * nothing by itself. The caller must still verify token_hash matches AND
 * that the row's real tenant_id equals this prefix, so a tampered or
 * mismatched prefix produces "not found," never cross-tenant access.
 */
export function encodeCompoundToken(tenantId: string, rawToken: string): string {
  return `${tenantId}.${rawToken}`;
}

export interface DecodedCompoundToken {
  tenantId: string;
  rawToken: string;
}

/** Returns null on any malformed input rather than throwing -- callers treat that identically to "not found." */
export function decodeCompoundToken(compound: string): DecodedCompoundToken | null {
  const separatorIndex = compound.indexOf(".");
  if (separatorIndex <= 0 || separatorIndex === compound.length - 1) {
    return null;
  }
  const tenantId = compound.slice(0, separatorIndex);
  const rawToken = compound.slice(separatorIndex + 1);
  if (!UUID_PATTERN.test(tenantId)) {
    return null;
  }
  return { tenantId, rawToken };
}
