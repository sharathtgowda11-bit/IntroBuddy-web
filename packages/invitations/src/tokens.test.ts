import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeCompoundToken, encodeCompoundToken, generateRawToken, hashToken } from "./tokens.js";

test("generateRawToken produces distinct, sufficiently long tokens", () => {
  const a = generateRawToken();
  const b = generateRawToken();
  assert.notEqual(a, b);
  // 32 raw bytes, base64url-encoded, is at least 43 characters.
  assert.ok(a.length >= 43);
});

test("hashToken is deterministic and distinguishes different inputs", () => {
  const raw = generateRawToken();
  assert.equal(hashToken(raw), hashToken(raw));
  assert.notEqual(hashToken(raw), hashToken(generateRawToken()));
});

test("compound token round-trips tenant id and raw token", () => {
  const tenantId = "11111111-2222-3333-4444-555555555555";
  const raw = generateRawToken();
  const compound = encodeCompoundToken(tenantId, raw);
  const decoded = decodeCompoundToken(compound);
  assert.deepEqual(decoded, { tenantId, rawToken: raw });
});

test("decodeCompoundToken rejects malformed or tampered input", () => {
  assert.equal(decodeCompoundToken("no-separator-at-all"), null);
  assert.equal(decodeCompoundToken(".missing-tenant-prefix"), null);
  assert.equal(decodeCompoundToken("11111111-2222-3333-4444-555555555555."), null);
  assert.equal(decodeCompoundToken("not-a-uuid.someRawToken"), null);
});
