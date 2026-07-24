import { z } from "zod";

// College-managed fields (name, USN, degree, department, graduation year,
// email) are deliberately absent -- spec 8.4's profile fields table marks
// them not editable by the student, so they're simply not in this schema.
export const StudentProfileUpdateSchema = z.object({
  linkedinUrl: z.string().url().optional(),
  githubUrl: z.string().url().optional(),
  bio: z.string().optional(),
  skills: z.string().optional(),
  interests: z.string().optional(),
  achievements: z.string().optional(),
});
export type StudentProfileUpdateInput = z.infer<typeof StudentProfileUpdateSchema>;

export const CertificationTypeSchema = z.enum(["workshop", "internship", "course"]);

export const CertificationCreateSchema = z.object({
  name: z.string().min(1),
  type: CertificationTypeSchema,
  issuingOrganisation: z.string().min(1),
  date: z.string().optional(),
  certificateUrl: z.string().url().optional(),
});
export type CertificationCreateInput = z.infer<typeof CertificationCreateSchema>;

export const CertificationUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  type: CertificationTypeSchema.optional(),
  issuingOrganisation: z.string().min(1).optional(),
  date: z.string().optional(),
  certificateUrl: z.string().url().optional(),
});
export type CertificationUpdateInput = z.infer<typeof CertificationUpdateSchema>;
