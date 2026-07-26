import { z } from "zod";

// Phase 2: Alumni module schemas.

// POST /alumni -- manual single add (a convenience path onto the same
// alumni.import capability, mirroring bulk import). departmentId only --
// degreeId is always derived server-side from the department, the same
// principle as InvitationCreateSchema and StudentEditSchema. Never company
// -- that field doesn't belong to college_users (see the settled design
// decision in packages/import's alumni row validation).
export const AlumniCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  departmentId: z.string().uuid().optional(),
  graduationYear: z.number().int().optional(),
});
export type AlumniCreateInput = z.infer<typeof AlumniCreateSchema>;

// PATCH /alumni/:id -- college-managed fields only. Never touches
// alumni_profiles, which is self-managed by the alumnus (mirrors
// StudentEditSchema, which is likewise off-limits to student_profiles).
export const AlumniEditSchema = z.object({
  name: z.string().min(1).optional(),
  departmentId: z.string().uuid().optional(),
  graduationYear: z.number().int().optional(),
});
export type AlumniEditInput = z.infer<typeof AlumniEditSchema>;

// PATCH /alumni/:id/status -- bidirectional (active <-> deactivated),
// mirroring StudentStatusUpdateSchema exactly: one endpoint covers both
// deactivating and reactivating.
export const AlumniStatusUpdateSchema = z.object({
  status: z.enum(["active", "deactivated"]),
});
export type AlumniStatusUpdateInput = z.infer<typeof AlumniStatusUpdateSchema>;

// PATCH /me/profile (alumni). Accepts a partial body -- the 3-step wizard
// makes one call per step, each upserting only the fields it supplied, so
// nothing here is required at the schema level. Which fields gate
// "profile complete" is a separate, computed-on-read business rule (never
// stored), not a zod constraint. avatarPath is set via multipart upload,
// not this JSON body -- identical handling to the student avatar upload.
//
// This endpoint is always multipart/form-data (same "one consistent client
// contract" precedent as the student profile route), so yearsOfExperience
// arrives as a string, not a number -- z.coerce handles that. skills
// arrives as a JSON-encoded string (multipart form fields can't reliably
// round-trip a single-element array), decoded by the route before this
// schema sees it -- see apps/api's PATCH /me/profile.
export const AlumniProfilePatchSchema = z.object({
  bio: z.string().optional(),
  phone: z.string().optional(),
  linkedinUrl: z.string().url().optional(),
  githubUrl: z.string().url().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  skills: z.array(z.string()).optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  yearsOfExperience: z.coerce.number().int().min(0).optional(),
  workEmail: z.string().email().optional(),
});
export type AlumniProfilePatchInput = z.infer<typeof AlumniProfilePatchSchema>;

// POST /opportunities. company is independent of the poster's own profile
// company -- never defaulted or forced to match.
export const OpportunityCreateSchema = z
  .object({
    type: z.enum(["job", "internship", "referral"]),
    title: z.string().min(1),
    description: z.string().optional(),
    company: z.string().optional(),
    location: z.string().optional(),
    applyUrl: z.string().url().optional(),
    deadline: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.deadline === undefined) return;
    const parsed = new Date(data.deadline);
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["deadline"], message: "deadline must be a valid date" });
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsed < today) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["deadline"], message: "deadline must not be in the past" });
    }
  });
export type OpportunityCreateInput = z.infer<typeof OpportunityCreateSchema>;

// PATCH /opportunities/:id -- partial updates, including status
// transitions (open -> closed). No past-deadline refine here: editing an
// already-posted opportunity (e.g. closing it) must not be blocked by a
// deadline that has since passed.
export const OpportunityUpdateSchema = z.object({
  type: z.enum(["job", "internship", "referral"]).optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  applyUrl: z.string().url().optional(),
  deadline: z.string().optional(),
  status: z.enum(["open", "closed", "expired"]).optional(),
});
export type OpportunityUpdateInput = z.infer<typeof OpportunityUpdateSchema>;

// POST /requests. opportunityId is required for a referral request and
// forbidden for a mentorship request -- this mirrors the DB CHECK
// constraint requests_referral_needs_opportunity (Migration 2) so a bad
// request is rejected by validation before it ever reaches the database.
export const RequestCreateSchema = z
  .object({
    alumnusId: z.string().uuid(),
    type: z.enum(["mentorship", "referral"]),
    opportunityId: z.string().uuid().optional(),
    message: z.string().min(1).max(2000),
  })
  .superRefine((data, ctx) => {
    if (data.type === "referral" && data.opportunityId === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["opportunityId"],
        message: "opportunityId is required for referral requests",
      });
    }
    if (data.type === "mentorship" && data.opportunityId !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["opportunityId"],
        message: "opportunityId must be omitted for mentorship requests",
      });
    }
  });
export type RequestCreateInput = z.infer<typeof RequestCreateSchema>;

// PATCH /requests/:id/respond
export const RequestRespondSchema = z.object({
  status: z.enum(["accepted", "declined"]),
  responseMessage: z.string().optional(),
});
export type RequestRespondInput = z.infer<typeof RequestRespondSchema>;
