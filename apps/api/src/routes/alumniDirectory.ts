import { getPool, withTenant } from "@introbuddy/db";
import { PERMISSIONS } from "@introbuddy/shared";
import { Router } from "express";
import { findAlumniDirectoryById, listAlumniDirectory } from "../db/alumniDirectory.js";
import { listOpenOpportunitiesByPoster } from "../db/opportunities.js";
import { getSignedAlumniMediaUrl } from "../lib/alumniMedia.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { resolveSession } from "../middleware/resolveSession.js";

// Deliberately a separate router from routes/alumni.ts (Part 2, rule 7).
// Do not merge this into /alumni with a role-conditional filter -- that
// pattern is exactly how an incomplete-profile alumnus, or a private
// field, would accidentally leak to a student through a shared code path.
export const alumniDirectoryRouter = Router();

function queryString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function queryNumber(value: unknown): number | undefined {
  const str = queryString(value);
  if (str === undefined) return undefined;
  const parsed = Number(str);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function withAvatarUrl<T extends { avatarPath: string | null }>(item: T): Promise<Omit<T, "avatarPath"> & { avatarUrl: string | null }> {
  const { avatarPath, ...rest } = item;
  const avatarUrl = avatarPath ? await getSignedAlumniMediaUrl(avatarPath) : null;
  return { ...rest, avatarUrl };
}

alumniDirectoryRouter.get("/", resolveSession(), requirePermission(PERMISSIONS.ALUMNI_DIRECTORY_VIEW), async (req, res) => {
  const session = req.session!;
  const pool = getPool();

  const search = queryString(req.query.search);
  const company = queryString(req.query.company);
  const departmentId = queryString(req.query.departmentId);
  const graduationYear = queryNumber(req.query.graduationYear);

  try {
    // RLS scopes to the student's own college automatically -- no
    // additional filtering needed beyond withTenant(session.tenantId).
    const rows = await withTenant(pool, session.tenantId, (client) =>
      listAlumniDirectory(client, { search, company, departmentId, graduationYear }),
    );
    const alumni = await Promise.all(rows.map(withAvatarUrl));
    res.status(200).json({ alumni });
  } catch (error) {
    console.error("failed to list alumni directory", error);
    res.status(500).json({ error: "internal error" });
  }
});

alumniDirectoryRouter.get("/:id", resolveSession(), requirePermission(PERMISSIONS.ALUMNI_DIRECTORY_VIEW), async (req, res) => {
  const id = req.params.id as string;
  const session = req.session!;
  const pool = getPool();

  try {
    const { detail, opportunities } = await withTenant(pool, session.tenantId, async (client) => {
      const detail = await findAlumniDirectoryById(client, id);
      if (!detail) {
        return { detail: null, opportunities: [] };
      }
      const opportunities = await listOpenOpportunitiesByPoster(client, id);
      return { detail, opportunities };
    });

    // Same gate and filtering as the list -- an alumnus who doesn't meet
    // the visibility bar simply doesn't exist from this endpoint's point
    // of view (404, not a more specific error).
    if (!detail) {
      res.status(404).json({ error: "not found" });
      return;
    }

    const alumnus = await withAvatarUrl(detail);
    res.status(200).json({ ...alumnus, opportunities });
  } catch (error) {
    console.error("failed to load alumnus directory profile", error);
    res.status(500).json({ error: "internal error" });
  }
});
