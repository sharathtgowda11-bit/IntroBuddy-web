import { getPool, withTenant } from "@introbuddy/db";
import {
  AlumniProfilePatchSchema,
  CertificationCreateSchema,
  CertificationUpdateSchema,
  PERMISSIONS,
  StudentProfileUpdateSchema,
} from "@introbuddy/shared";
import { Router } from "express";
import multer from "multer";
import { getOwnAlumniProfile, isAlumniProfileComplete, upsertAlumniProfile } from "../db/alumniProfiles.js";
import { createCertification, deleteCertification, listCertifications, updateCertification } from "../db/certifications.js";
import { getOwnProfile, upsertStudentProfile } from "../db/studentProfiles.js";
import { getSignedAlumniMediaUrl, uploadAlumniAvatar } from "../lib/alumniMedia.js";
import { stripExifAndNormalize } from "../lib/imageProcessing.js";
import { getSignedStudentMediaUrl, uploadStudentAvatar, uploadStudentResume } from "../lib/studentMedia.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { resolveSession } from "../middleware/resolveSession.js";

export const meRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // matches supabase/config.toml's student-media bucket
});

// PATCH/GET /me/profile are role-aware: branch on session.role. The
// student path below is entirely unchanged. One endpoint, one URL, one
// permission (PROFILE_EDIT_OWN) for both roles -- no separate
// /me/alumni-profile route (Part 8.6).
meRouter.get("/profile", resolveSession(), requirePermission(PERMISSIONS.PROFILE_EDIT_OWN), async (req, res) => {
  const session = req.session!;
  const pool = getPool();

  if (session.role === "alumni") {
    try {
      const profile = await withTenant(pool, session.tenantId, (client) => getOwnAlumniProfile(client, session.collegeUserId));
      if (!profile) {
        res.status(404).json({ error: "not found" });
        return;
      }

      const avatarUrl = profile.avatarPath ? await getSignedAlumniMediaUrl(profile.avatarPath) : null;

      res.status(200).json({
        name: profile.name,
        email: profile.email,
        // Read-only graduation block -- college name, department name,
        // degree name, graduation year -- Step 2 of the wizard is a
        // display, never an input (Part 4).
        collegeName: profile.collegeName,
        degreeName: profile.degreeName,
        departmentName: profile.departmentName,
        graduationYear: profile.graduationYear,
        avatarUrl,
        bio: profile.bio,
        phone: profile.phone,
        linkedinUrl: profile.linkedinUrl,
        githubUrl: profile.githubUrl,
        company: profile.company,
        jobTitle: profile.jobTitle,
        skills: profile.skills,
        country: profile.country,
        city: profile.city,
        yearsOfExperience: profile.yearsOfExperience,
        workEmail: profile.workEmail,
        // Computed, never stored -- recomputed on every read (Part 4).
        profileComplete: isAlumniProfileComplete(profile),
      });
    } catch (error) {
      console.error("failed to load own alumni profile", error);
      res.status(500).json({ error: "internal error" });
    }
    return;
  }

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
    const session = req.session!;
    const pool = getPool();
    const files = req.files as { avatar?: Express.Multer.File[]; resume?: Express.Multer.File[] } | undefined;

    if (session.role === "alumni") {
      // skills arrives as a JSON-encoded string -- multipart form fields
      // can't reliably round-trip a single-element array -- decoded here,
      // at the transport boundary, before the schema (which expects a
      // real string array) ever sees it.
      const body = { ...req.body };
      if (typeof body.skills === "string") {
        try {
          body.skills = JSON.parse(body.skills);
        } catch {
          res.status(400).json({ error: "invalid request", details: { skills: "must be valid JSON" } });
          return;
        }
      }

      const parsed = AlumniProfilePatchSchema.safeParse(body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
        return;
      }

      try {
        let avatarPath: string | undefined;
        if (files?.avatar?.[0]) {
          const processed = await stripExifAndNormalize(files.avatar[0].buffer);
          avatarPath = await uploadAlumniAvatar(
            session.tenantId,
            session.collegeUserId,
            processed.buffer,
            processed.contentType,
            processed.extension,
          );
        }

        // This upsert is what creates the alumni_profiles row on first
        // call -- never created eagerly during import commit (Part 4).
        await withTenant(pool, session.tenantId, (client) =>
          upsertAlumniProfile(client, session.tenantId, session.collegeUserId, { avatarPath, ...parsed.data }),
        );

        res.status(200).json({ status: "updated" });
      } catch (error) {
        console.error("failed to update own alumni profile", error);
        res.status(500).json({ error: "internal error" });
      }
      return;
    }

    const parsed = StudentProfileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
      return;
    }

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
