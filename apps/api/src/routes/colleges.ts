import { randomUUID } from "node:crypto";
import { getPool, withTenant } from "@introbuddy/db";
import {
  encodeCompoundToken,
  findPendingCollegeAdmin,
  provisionInvitation,
  provisionInvitationInTransaction,
} from "@introbuddy/invitations";
import { CollegeCreateSchema, CollegeProfileUpdateSchema, PERMISSIONS, slugify } from "@introbuddy/shared";
import { Router } from "express";
import multer from "multer";
import type { Pool } from "pg";
import { createDegree } from "../db/degrees.js";
import { createDepartment } from "../db/departments.js";
import { writeAuditLog } from "../db/auditLog.js";
import { createTenant, findTenantBySlug, findTenantById, listCollegesWithStudentCounts, updateTenantProfile } from "../db/tenants.js";
import { getEnv } from "../env.js";
import { sendCollegeAdminInvitationEmail } from "../lib/email.js";
import { stripExifAndNormalize } from "../lib/imageProcessing.js";
import { DEFAULT_TAXONOMY } from "../lib/defaultTaxonomy.js";
import { getSignedImageUrl, uploadCollegeImage } from "../lib/storage.js";
import { resolveSession } from "../middleware/resolveSession.js";
import { requirePermission } from "../middleware/requirePermission.js";

export const collegesRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // matches supabase/config.toml's college-media bucket
});

async function generateUniqueSlug(pool: Pool, name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let attempt = 0;
  while (await findTenantBySlug(pool, candidate)) {
    attempt += 1;
    candidate = `${base}-${attempt}`;
  }
  return candidate;
}

// Platform-wide, for super_admin's dashboard -- deliberately unscoped (no
// withTenant), same as findTenantById's own precedent that tenants
// carries no RLS. See listCollegesWithStudentCounts for how per-college
// student counts cross tenant boundaries safely.
collegesRouter.get("/", resolveSession(), requirePermission(PERMISSIONS.COLLEGE_VIEW_ALL), async (req, res) => {
  try {
    const colleges = await listCollegesWithStudentCounts(getPool());
    res.status(200).json({ colleges });
  } catch (error) {
    console.error("failed to list colleges", error);
    res.status(500).json({ error: "internal error" });
  }
});

collegesRouter.post("/", resolveSession(), requirePermission(PERMISSIONS.COLLEGE_CREATE), async (req, res) => {
  const parsed = CollegeCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
    return;
  }
  const { name, state, city, adminName, adminEmail } = parsed.data;
  const session = req.session!;
  const pool = getPool();
  const env = getEnv();

  const tenantId = randomUUID();
  const slug = await generateUniqueSlug(pool, name);

  try {
    const result = await withTenant(pool, tenantId, async (client) => {
      await createTenant(client, { id: tenantId, name, slug, state, city });

      for (const { degree, departments } of DEFAULT_TAXONOMY) {
        const degreeRecord = await createDegree(client, tenantId, degree);
        for (const departmentName of departments) {
          await createDepartment(client, tenantId, degreeRecord.id, departmentName);
        }
      }

      const invitationResult = await provisionInvitationInTransaction(pool, client, {
        tenantId,
        email: adminEmail,
        name: adminName,
        role: "college_admin",
        invitedByCollegeUserId: session.collegeUserId,
      });

      await writeAuditLog(client, {
        tenantId,
        actorCollegeUserId: session.collegeUserId,
        action: "college.create",
        targetType: "tenant",
        targetId: tenantId,
        ipAddress: req.ip ?? null,
      });

      return invitationResult;
    });

    if (result.conflict) {
      res.status(409).json({ error: "an active account already exists for this admin email" });
      return;
    }

    const activationUrl = `${env.WEB_APP_URL}/activate?token=${encodeCompoundToken(tenantId, result.rawToken)}`;
    await sendCollegeAdminInvitationEmail({ to: adminEmail, collegeName: name, tenantSlug: slug, activationUrl });

    res.status(201).json({ id: tenantId, slug, status: "provisioning" });
  } catch (error) {
    console.error("failed to create college", error);
    res.status(500).json({ error: "internal error" });
  }
});

// Gated on COLLEGE_CREATE, not COLLEGE_ADMIN_INVITE: that permission is
// held by both super_admin and college_admin, and this route accepts an
// arbitrary :tenantId -- gating it on a permission college_admin also
// holds would let one college reissue an invitation for a completely
// different college just by supplying a different id. hasPermission
// encodes capability, not tenant scope; COLLEGE_CREATE is super_admin-only,
// which is what actually keeps this route safe.
collegesRouter.post("/:tenantId/reinvite-admin", resolveSession(), requirePermission(PERMISSIONS.COLLEGE_CREATE), async (req, res) => {
  // req.params values are typed string | string[] by Express's generic
  // ParamsDictionary; this route's :tenantId segment is never repeated,
  // so it can only ever be a plain string at runtime.
  const tenantId = req.params.tenantId as string;
  const session = req.session!;
  const pool = getPool();
  const env = getEnv();

  try {
    const pendingAdmin = await withTenant(pool, tenantId, (client) => findPendingCollegeAdmin(client));
    if (!pendingAdmin) {
      res.status(404).json({ error: "no pending college admin invitation found for this college" });
      return;
    }

    const result = await provisionInvitation(pool, {
      tenantId,
      email: pendingAdmin.email,
      name: pendingAdmin.name,
      role: "college_admin",
      invitedByCollegeUserId: session.collegeUserId,
    });

    if (result.conflict) {
      res.status(409).json({ error: "college admin is already active" });
      return;
    }

    const tenant = await findTenantById(pool, tenantId);
    const activationUrl = `${env.WEB_APP_URL}/activate?token=${encodeCompoundToken(tenantId, result.rawToken)}`;
    await sendCollegeAdminInvitationEmail({
      to: pendingAdmin.email,
      collegeName: tenant?.name ?? "your college",
      tenantSlug: tenant?.slug ?? "",
      activationUrl,
    });

    res.status(200).json({ status: "reinvited" });
  } catch (error) {
    console.error("failed to reinvite college admin", error);
    res.status(500).json({ error: "internal error" });
  }
});

collegesRouter.get("/me", resolveSession(), async (req, res) => {
  const pool = getPool();
  const tenant = await withTenant(pool, req.session!.tenantId, (client) => findTenantById(client, req.session!.tenantId));
  if (!tenant) {
    res.status(404).json({ error: "not found" });
    return;
  }

  const [logoUrl, bannerUrl] = await Promise.all([
    tenant.logoPath ? getSignedImageUrl(tenant.logoPath) : Promise.resolve(null),
    tenant.bannerPath ? getSignedImageUrl(tenant.bannerPath) : Promise.resolve(null),
  ]);

  res.status(200).json({ ...tenant, logoUrl, bannerUrl });
});

// Always multipart/form-data, even for text-only updates -- one
// consistent client contract rather than branching on content-type.
collegesRouter.patch(
  "/me/profile",
  resolveSession(),
  requirePermission(PERMISSIONS.COLLEGE_EDIT_PROFILE),
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "banner", maxCount: 1 },
  ]),
  async (req, res) => {
    const parsed = CollegeProfileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
      return;
    }

    const session = req.session!;
    const pool = getPool();
    const files = req.files as { logo?: Express.Multer.File[]; banner?: Express.Multer.File[] } | undefined;

    try {
      let logoPath: string | undefined;
      let bannerPath: string | undefined;

      if (files?.logo?.[0]) {
        const processed = await stripExifAndNormalize(files.logo[0].buffer);
        logoPath = await uploadCollegeImage(session.tenantId, "logo", processed.buffer, processed.contentType, processed.extension);
      }
      if (files?.banner?.[0]) {
        const processed = await stripExifAndNormalize(files.banner[0].buffer);
        bannerPath = await uploadCollegeImage(session.tenantId, "banner", processed.buffer, processed.contentType, processed.extension);
      }

      await withTenant(pool, session.tenantId, (client) =>
        updateTenantProfile(client, session.tenantId, {
          description: parsed.data.description,
          contactEmail: parsed.data.contactEmail,
          contactPhone: parsed.data.contactPhone,
          logoPath,
          bannerPath,
        }),
      );

      res.status(200).json({ status: "updated" });
    } catch (error) {
      console.error("failed to update college profile", error);
      res.status(500).json({ error: "internal error" });
    }
  },
);
