# 3. Data-driven, permission-based authorization instead of role-string checks

Status: Accepted (Milestone 2)

## Context

Phase 1 has three roles (`super_admin`, `college_admin`, `student`) and a full capability matrix (spec section 7.3). More roles are plausible later (the spec names "Placement Officer" as a reduced-permission variant deferred to data, not code). Authorization checks scattered through route handlers as `if (role === 'college_admin')` would mean every future role change is a find-and-replace across the codebase, with no single place to see the whole permission matrix at once — and a live risk of missing a call site.

## Decision

`packages/shared/src/permissions.ts` encodes the entire spec 7.3 matrix once, as data: a `PERMISSIONS` map of named, dot-namespaced capabilities (`student.deactivate`, `collegeAdmin.invite`, ...) and a `ROLE_PERMISSIONS: Record<Role, Permission[]>` map. Call sites check `hasPermission(role, PERMISSIONS.X)`, never a role-string comparison.

One capability is deliberately **absent** from the map: "set another user's password." No role ever holds it (spec section 14.1, #6) — the corresponding API route doesn't exist at all, so there is nothing to gate. A unit test (`permissions.test.ts`) asserts this constant literally doesn't exist, so its accidental introduction later would be a visible, deliberate change, not a silent regression.

While implementing Milestone 2's invitation endpoint, this design surfaced and fixed a real mistake in the original implementation plan: the plan had assumed `college_admin` could only invite `student`, but the spec's own text (section 7.1: College Admin is "Invited by Super Admin, or by another College Admin"; section 7.3 matrix: "Invite College Admin — Yes, own college") says a College Admin can also invite *another* College Admin. Because the permission map is one small, explicit table rather than logic embedded across handlers, this was a one-line fix once noticed, verified immediately by adding a unit test for exactly that case.

## Consequences

- Adding a role, or changing what an existing role can do, is an edit to `ROLE_PERMISSIONS` in one file — never a refactor across route handlers.
- The invitation endpoint's "who can invite whom" logic is a small explicit map (`INVITE_TARGET_PERMISSION`) rather than special-cased `if` branches, and is unit-tested independently of any database or HTTP layer.
- The full matrix is encoded now, even though Milestone 2 only exercises a couple of its entries — deliberate, since the matrix is already fully specified by the existing spec (not speculative), and Milestone 3+ can consume the rest without redefining the data model.
