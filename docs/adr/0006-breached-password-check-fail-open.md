# 6. Breached-password check via HaveIBeenPwned k-anonymity, fails open

Status: Accepted (Milestone 2)

## Context

Spec section 14.1 (#13) requires passwords be checked against known-breached-password lists during activation and password reset. Maintaining a local breached-password corpus (hundreds of millions of entries) is exactly the kind of infrastructure the project's own architecture principles say not to build in anticipation (spec section 5.1). A hosted check introduces a third-party dependency in the activation/reset path, which needs an explicit answer for what happens when that dependency is slow or unreachable.

## Decision

`apps/api/src/lib/breachedPassword.ts` checks a password against the HaveIBeenPwned Pwned Passwords **range API** using k-anonymity: only the first 5 hex characters of the password's SHA-1 hash are ever sent; the full password and full hash never leave the server, and no API key is required.

The check **fails open**: any network error or timeout (3s) is logged and treated as "not breached," never blocking activation or password reset. A third-party outage must not be able to lock users out of an otherwise-correct activation flow. `BREACHED_PASSWORD_CHECK_ENABLED` (default `true`) disables the check entirely for offline development and CI, where it's set to `false` to avoid a real network dependency in the test suite — the fail-open design means this only affects test speed and offline capability, never what's being verified.

## Consequences

- No new infrastructure, no locally-maintained breach corpus, no API key management.
- A genuinely breached password could theoretically slip through during a HaveIBeenPwned outage — an accepted, explicit trade-off (availability of activation/reset over this one additional check), not an oversight.
- Adds one external HTTP call to the activation and reset-completion code paths; bounded by the 3-second timeout so it cannot hang a request indefinitely.
