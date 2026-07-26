import { getPool, withTenant } from "@introbuddy/db";
import { OpportunityCreateSchema, OpportunityUpdateSchema, PERMISSIONS } from "@introbuddy/shared";
import { Router } from "express";
import { getAlumniEligibility } from "../db/alumniProfiles.js";
import {
  createOpportunity,
  deleteOpportunity,
  findOwnOpportunityById,
  listOpenOpportunities,
  listOwnOpportunities,
  updateOpportunity,
  type OpportunityType,
} from "../db/opportunities.js";
import { isForeignKeyViolation } from "../lib/pgErrors.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { resolveSession } from "../middleware/resolveSession.js";

export const opportunitiesRouter = Router();

function queryString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// GET /opportunities/mine must be registered before GET /opportunities/:id
// would be -- there is no such :id GET route in this router, so no
// collision, but the ordering convention is kept for future-proofing.
opportunitiesRouter.get("/mine", resolveSession(), requirePermission(PERMISSIONS.OPPORTUNITY_MANAGE), async (req, res) => {
  const session = req.session!;
  const pool = getPool();

  try {
    const opportunities = await withTenant(pool, session.tenantId, (client) => listOwnOpportunities(client, session.collegeUserId));
    res.status(200).json({ opportunities });
  } catch (error) {
    console.error("failed to list own opportunities", error);
    res.status(500).json({ error: "internal error" });
  }
});

// Student browse -- open, posted by an alumnus who is active and
// profile-complete, same visibility gate as the directory.
opportunitiesRouter.get("/", resolveSession(), requirePermission(PERMISSIONS.OPPORTUNITY_VIEW), async (req, res) => {
  const session = req.session!;
  const pool = getPool();

  const type = queryString(req.query.type) as OpportunityType | undefined;
  const company = queryString(req.query.company);
  const search = queryString(req.query.search);

  try {
    const opportunities = await withTenant(pool, session.tenantId, (client) => listOpenOpportunities(client, { type, company, search }));
    res.status(200).json({ opportunities });
  } catch (error) {
    console.error("failed to list open opportunities", error);
    res.status(500).json({ error: "internal error" });
  }
});

opportunitiesRouter.post("/", resolveSession(), requirePermission(PERMISSIONS.OPPORTUNITY_CREATE), async (req, res) => {
  const parsed = OpportunityCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
    return;
  }

  const session = req.session!;
  const pool = getPool();

  try {
    const outcome = await withTenant(pool, session.tenantId, async (client) => {
      // Require the caller's own profile to be complete before allowing a
      // post -- reject with a clear error rather than silently allowing
      // an incomplete-profile alumnus to post (Part 4/8.4).
      const eligibility = await getAlumniEligibility(client, session.collegeUserId);
      if (!eligibility || !eligibility.isComplete) {
        return { kind: "profile_incomplete" as const };
      }

      // posted_by_college_user_id is always session.collegeUserId -- never
      // accepted from the request body.
      const created = await createOpportunity(client, {
        tenantId: session.tenantId,
        postedByCollegeUserId: session.collegeUserId,
        type: parsed.data.type,
        title: parsed.data.title,
        description: parsed.data.description,
        company: parsed.data.company,
        location: parsed.data.location,
        applyUrl: parsed.data.applyUrl,
        deadline: parsed.data.deadline,
      });
      return { kind: "ok" as const, created };
    });

    if (outcome.kind === "profile_incomplete") {
      res.status(400).json({ error: "complete your profile before posting an opportunity" });
      return;
    }

    res.status(201).json(outcome.created);
  } catch (error) {
    console.error("failed to create opportunity", error);
    res.status(500).json({ error: "internal error" });
  }
});

// Own only. 404 (not 403) if the id exists but belongs to another alumnus
// -- same enumeration-resistant precedent as elsewhere in this codebase.
opportunitiesRouter.patch("/:id", resolveSession(), requirePermission(PERMISSIONS.OPPORTUNITY_MANAGE), async (req, res) => {
  const parsed = OpportunityUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
    return;
  }

  const id = req.params.id as string;
  const session = req.session!;
  const pool = getPool();

  try {
    const outcome = await withTenant(pool, session.tenantId, async (client) => {
      const existing = await findOwnOpportunityById(client, id, session.collegeUserId);
      if (!existing) {
        return "not_found" as const;
      }
      await updateOpportunity(client, id, parsed.data);
      return "ok" as const;
    });

    if (outcome === "not_found") {
      res.status(404).json({ error: "not found" });
      return;
    }

    res.status(200).json({ status: "updated" });
  } catch (error) {
    console.error("failed to update opportunity", error);
    res.status(500).json({ error: "internal error" });
  }
});

opportunitiesRouter.delete("/:id", resolveSession(), requirePermission(PERMISSIONS.OPPORTUNITY_MANAGE), async (req, res) => {
  const id = req.params.id as string;
  const session = req.session!;
  const pool = getPool();

  try {
    const outcome = await withTenant(pool, session.tenantId, async (client) => {
      const existing = await findOwnOpportunityById(client, id, session.collegeUserId);
      if (!existing) {
        return "not_found" as const;
      }
      await deleteOpportunity(client, id);
      return "ok" as const;
    });

    if (outcome === "not_found") {
      res.status(404).json({ error: "not found" });
      return;
    }

    res.status(204).send();
  } catch (error) {
    // If a requests row references this opportunity, the composite FK
    // (requests_opportunity_tenant_fkey) rejects the delete with 23503 --
    // translate to 409, same pattern as blocking degree deletion when
    // departments still reference it.
    if (isForeignKeyViolation(error)) {
      res.status(409).json({ error: "cannot delete an opportunity with requests against it -- close it instead" });
      return;
    }
    console.error("failed to delete opportunity", error);
    res.status(500).json({ error: "internal error" });
  }
});
