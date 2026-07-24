import { getPool, withTenant } from "@introbuddy/db";
import {
  CertificationCreateSchema,
  CertificationUpdateSchema,
  PERMISSIONS,
  StudentProfileUpdateSchema,
} from "@introbuddy/shared";
import { Router } from "express";
import multer from "multer";
import { createCertification, deleteCertification, listCertifications, updateCertification } from "../db/certifications.js";
import { getOwnProfile, upsertStudentProfile } from "../db/studentProfiles.js";
import { stripExifAndNormalize } from "../lib/imageProcessing.js";
import { getSignedStudentMediaUrl, uploadStudentAvatar, uploadStudentResume } from "../lib/studentMedia.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { resolveSession } from "../middleware/resolveSession.js";

export const meRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // matches supabase/config.toml's student-media bucket
});

meRouter.get("/profile", resolveSession(), requirePermission(PERMISSIONS.PROFILE_EDIT_OWN), async (req, res) => {
  const session = req.session!;
  const pool = getPool();

  try {
    const { profile, certifications } = await withTenant(pool, session.tenantId, async (client) => {
      const profile = await getOwnProfile(client, session.collegeUserId);
      const certifications = await listCertifications(client, session.collegeUserId);
      return { profile, certifications };
    });

    if (!profile) {
      res.status(404).json({ error: "not found" });
      return;
    }

    const [avatarUrl, resumeUrl] = await Promise.all([
      profile.avatarPath ? getSignedStudentMediaUrl(profile.avatarPath) : Promise.resolve(null),
      profile.resumePath ? getSignedStudentMediaUrl(profile.resumePath) : Promise.resolve(null),
    ]);

    res.status(200).json({
      name: profile.name,
      usn: profile.usn,
      email: profile.email,
      graduationYear: profile.graduationYear,
      degreeName: profile.degreeName,
      departmentName: profile.departmentName,
      avatarUrl,
      linkedinUrl: profile.linkedinUrl,
      githubUrl: profile.githubUrl,
      resumeUrl,
      bio: profile.bio,
      skills: profile.skills,
      interests: profile.interests,
      achievements: profile.achievements,
      // Computed, never stored (spec 8.4): complete once both required fields are present.
      profileComplete: Boolean(avatarUrl) && Boolean(profile.linkedinUrl),
      certifications,
    });
  } catch (error) {
    console.error("failed to load own profile", error);
    res.status(500).json({ error: "internal error" });
  }
});

// Always multipart/form-data, even for text-only updates -- one
// consistent client contract, same as PATCH /colleges/me/profile.
meRouter.patch(
  "/profile",
  resolveSession(),
  requirePermission(PERMISSIONS.PROFILE_EDIT_OWN),
  upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "resume", maxCount: 1 },
  ]),
  async (req, res) => {
    const parsed = StudentProfileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
      return;
    }

    const session = req.session!;
    const pool = getPool();
    const files = req.files as { avatar?: Express.Multer.File[]; resume?: Express.Multer.File[] } | undefined;

    try {
      let avatarPath: string | undefined;
      let resumePath: string | undefined;

      if (files?.avatar?.[0]) {
        const processed = await stripExifAndNormalize(files.avatar[0].buffer);
        avatarPath = await uploadStudentAvatar(
          session.tenantId,
          session.collegeUserId,
          processed.buffer,
          processed.contentType,
          processed.extension,
        );
      }
      if (files?.resume?.[0]) {
        const resumeFile = files.resume[0];
        if (resumeFile.mimetype !== "application/pdf") {
          res.status(400).json({ error: "resume must be a PDF" });
          return;
        }
        resumePath = await uploadStudentResume(session.tenantId, session.collegeUserId, resumeFile.buffer);
      }

      await withTenant(pool, session.tenantId, (client) =>
        upsertStudentProfile(client, session.tenantId, session.collegeUserId, {
          avatarPath,
          resumePath,
          linkedinUrl: parsed.data.linkedinUrl,
          githubUrl: parsed.data.githubUrl,
          bio: parsed.data.bio,
          skills: parsed.data.skills,
          interests: parsed.data.interests,
          achievements: parsed.data.achievements,
        }),
      );

      res.status(200).json({ status: "updated" });
    } catch (error) {
      console.error("failed to update own profile", error);
      res.status(500).json({ error: "internal error" });
    }
  },
);

meRouter.post(
  "/certifications",
  resolveSession(),
  requirePermission(PERMISSIONS.PROFILE_EDIT_OWN),
  async (req, res) => {
    const parsed = CertificationCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
      return;
    }

    const session = req.session!;
    const pool = getPool();

    try {
      const created = await withTenant(pool, session.tenantId, (client) =>
        createCertification(client, {
          tenantId: session.tenantId,
          collegeUserId: session.collegeUserId,
          name: parsed.data.name,
          type: parsed.data.type,
          issuingOrganisation: parsed.data.issuingOrganisation,
          date: parsed.data.date,
          certificateUrl: parsed.data.certificateUrl,
        }),
      );
      res.status(201).json(created);
    } catch (error) {
      console.error("failed to create certification", error);
      res.status(500).json({ error: "internal error" });
    }
  },
);

meRouter.patch(
  "/certifications/:id",
  resolveSession(),
  requirePermission(PERMISSIONS.PROFILE_EDIT_OWN),
  async (req, res) => {
    const parsed = CertificationUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
      return;
    }

    const id = req.params.id as string;
    const session = req.session!;
    const pool = getPool();

    try {
      const updated = await withTenant(pool, session.tenantId, (client) =>
        updateCertification(client, id, session.collegeUserId, parsed.data),
      );
      if (!updated) {
        res.status(404).json({ error: "not found" });
        return;
      }
      res.status(200).json(updated);
    } catch (error) {
      console.error("failed to update certification", error);
      res.status(500).json({ error: "internal error" });
    }
  },
);

meRouter.delete(
  "/certifications/:id",
  resolveSession(),
  requirePermission(PERMISSIONS.PROFILE_EDIT_OWN),
  async (req, res) => {
    const id = req.params.id as string;
    const session = req.session!;
    const pool = getPool();

    try {
      const deleted = await withTenant(pool, session.tenantId, (client) =>
        deleteCertification(client, id, session.collegeUserId),
      );
      if (!deleted) {
        res.status(404).json({ error: "not found" });
        return;
      }
      res.status(200).json({ status: "deleted" });
    } catch (error) {
      console.error("failed to delete certification", error);
      res.status(500).json({ error: "internal error" });
    }
  },
);
