import { createHash } from "node:crypto";
import { getEnv } from "../env.js";

const REQUEST_TIMEOUT_MS = 3000;

/**
 * Checks a password against the HaveIBeenPwned Pwned Passwords range API
 * using k-anonymity: only the first 5 hex characters of its SHA-1 hash
 * ever leave this server, never the password or its full hash, and no
 * API key is required (spec 14.1 #13).
 *
 * Fails open (logs and allows) on any network error or timeout -- a
 * third-party outage must never block activation or password reset
 * (plan decision D5). BREACHED_PASSWORD_CHECK_ENABLED=false disables the
 * check entirely for offline dev/CI.
 */
export async function isPasswordBreached(password: string): Promise<boolean> {
  const env = getEnv();
  if (!env.BREACHED_PASSWORD_CHECK_ENABLED) {
    return false;
  }

  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return false;
    }

    const body = await response.text();
    return body.split("\n").some((line) => line.split(":")[0]?.trim() === suffix);
  } catch (error) {
    console.error("breached password check failed, failing open", error);
    return false;
  }
}
