import { getPool, withTenant } from "@introbuddy/db";
import { PERMISSIONS, RequestCreateSchema, RequestRespondSchema } from "@introbuddy/shared";
import { Router } from "express";
import { getAlumniEligibility } from "../db/alumniProfiles.js";
import { findOpportunityById } from "../db/opportunities.js";
import {
  createRequest,
  findOwnReceivedRequestById,
  findOwnSentRequestById,
  listReceivedRequests,
  listSentRequests,
  setRequestResponse,
  setRequestWithdrawn,
} from "../db/requests.js";
import { getOwnProfile } from "../db/studentProfiles.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { resolveSession } from "../middleware/resolveSession.js";

export const requestsRouter = Router();

// Own only, filtered by student_college_user_id = session.collegeUserId.
requestsRouter.get("/sent", resolveSession(), requirePermission(PERMISSIONS.REQUEST_SEND), async (req, res) => {
  const session = req.session!;
  const pool = getPool();

  try {
    const requests = await withTenant(pool, session.tenantId, (client) => listSentRequests(client, session.collegeUserId));
    res.status(200).json({ requests });
  } catch (error) {
    console.error("failed to list sent requests", error);
    res.status(500).json({ error: "internal error" });
  }
});

// Own only, filtered by alumnus_college_user_id = session.collegeUserId.
requestsRouter.get("/received", resolveSession(), requirePermission(PERMISSIONS.REQUEST_RESPOND), async (req, res) => {
  const session = req.session!;
  const pool = getPool();

  try {
    const requests = await withTenant(pool, session.tenantId, (client) => listReceivedRequests(client, session.collegeUserId));
    res.status(200).json({ requests });
  } catch (error) {
    console.error("failed to list received requests", error);
    res.status(500).json({ error: "internal error" });
  }
});

requestsRouter.post("/", resolveSession(), requirePermission(PERMISSIONS.REQUEST_SEND), async (req, res) => {
  const parsed = RequestCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
    return;
  }

  const { alumnusId, type, opportunityId, message } = parsed.data;
  const session = req.session!;
  const pool = getPool();

  try {
    const outcome = await withTenant(pool, session.tenantId, async (client) => {
      // Requires the caller's own (student) profile to be complete before
      // sending -- reuses student_profiles' existing completeness rule
      // (avatarPath + linkedinUrl), the same one GET /me/profile computes.
      const ownProfile = await getOwnProfile(client, session.collegeUserId);
      const ownComplete = ownProfile !== null && ownProfile.avatarPath !== null && ownProfile.linkedinUrl !== null;
      if (!ownComplete) {
        return { kind: "own_profile_incomplete" as const };
      }

      // student_college_user_id is always session.collegeUserId -- never
      // client-supplied, no exceptions. The target alumnus must exist, be
      // active, and have a complete profile -- 404 if not, without
      // revealing whether an alumnus exists but is merely incomplete.
      const target = await getAlumniEligibility(client, alumnusId);
      if (!target || target.status !== "active" || !target.isComplete) {
        return { kind: "alumnus_not_found" as const };
      }

      if (type === "referral") {
        // Schema guarantees opportunityId is present for a referral
        // request. The referenced opportunity must belong to this
        // alumnus, be open, and be type='referral' -- that last check is
        // application-only, since a CHECK constraint can't verify a value
        // in another table.
        const opportunity = await findOpportunityById(client, opportunityId as string);
        if (
          !opportunity ||
          opportunity.postedByCollegeUserId !== alumnusId ||
          opportunity.status !== "open" ||
          opportunity.type !== "referral"
        ) {
          return { kind: "opportunity_invalid" as const };
        }
      }

      const created = await createRequest(client, {
        tenantId: session.tenantId,
        studentCollegeUserId: session.collegeUserId,
        alumnusCollegeUserId: alumnusId,
        type,
        opportunityId: opportunityId ?? null,
        message,
      });
      return { kind: "ok" as const, created };
    });

    if (outcome.kind === "own_profile_incomplete") {
      res.status(400).json({ error: "complete your profile before sending a request" });
      return;
    }
    if (outcome.kind === "alumnus_not_found") {
      res.status(404).json({ error: "not found" });
      return;
    }
    if (outcome.kind === "opportunity_invalid") {
      res.status(400).json({ error: "opportunity not found, not open, or not a referral posting" });
      return;
    }

    res.status(201).json(outcome.created);
  } catch (error) {
    console.error("failed to create request", error);
    res.status(500).json({ error: "internal error" });
  }
});

// Own only -- re-checked even though the row was already filtered by
// tenant. Only valid when the request's current status is 'pending'.
requestsRouter.patch("/:id/respond", resolveSession(), requirePermission(PERMISSIONS.REQUEST_RESPOND), async (req, res) => {
  const parsed = RequestRespondSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
    return;
  }

  const id = req.params.id as string;
  const session = req.session!;
  const pool = getPool();

  try {
    const outcome = await withTenant(pool, session.tenantId, async (client) => {
      const existing = await findOwnReceivedRequestById(client, id, session.collegeUserId);
      if (!existing) {
        return "not_found" as const;
      }
      if (existing.status !== "pending") {
        return "conflict" as const;
      }
      await setRequestResponse(client, id, parsed.data);
      return "ok" as const;
    });

    if (outcome === "not_found") {
      res.status(404).json({ error: "not found" });
      return;
    }
    if (outcome === "conflict") {
      res.status(409).json({ error: "this request has already been responded to or withdrawn" });
      return;
    }

    res.status(200).json({ status: parsed.data.status });
  } catch (error) {
    console.error("failed to respond to request", error);
    res.status(500).json({ error: "internal error" });
  }
});

// Own only. Only valid when status is 'pending'.
requestsRouter.patch("/:id/withdraw", resolveSession(), requirePermission(PERMISSIONS.REQUEST_SEND), async (req, res) => {
  const id = req.params.id as string;
  const session = req.session!;
  const pool = getPool();

  try {
    const outcome = await withTenant(pool, session.tenantId, async (client) => {
      const existing = await findOwnSentRequestById(client, id, session.collegeUserId);
      if (!existing) {
        return "not_found" as const;
      }
      if (existing.status !== "pending") {
        return "conflict" as const;
      }
      await setRequestWithdrawn(client, id);
      return "ok" as const;
    });

    if (outcome === "not_found") {
      res.status(404).json({ error: "not found" });
      return;
    }
    if (outcome === "conflict") {
      res.status(409).json({ error: "this request has already been responded to or withdrawn" });
      return;
    }

    res.status(200).json({ status: "withdrawn" });
  } catch (error) {
    console.error("failed to withdraw request", error);
    res.status(500).json({ error: "internal error" });
  }
});
