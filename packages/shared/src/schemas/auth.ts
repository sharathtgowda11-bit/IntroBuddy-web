import { z } from "zod";

// Raised from config.toml's local-dev default of 6 -- see plan decision D9.
const PASSWORD_MIN_LENGTH = 8;

export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH);

// departmentId only -- degreeId is always derived server-side from the
// department (see the student_import migration's comment on
// college_users.degree_id/department_id); a client can never supply it
// directly.
export const InvitationCreateSchema = z
  .object({
    email: z.string().email(),
    role: z.enum(["college_admin", "student"]),
    usn: z.string().min(1).optional(),
    departmentId: z.string().uuid().optional(),
    graduationYear: z.number().int().optional(),
  })
  .superRefine((data, ctx) => {
    const studentFields = { departmentId: data.departmentId, graduationYear: data.graduationYear } as const;
    if (data.role === "student") {
      for (const [key, value] of Object.entries(studentFields)) {
        if (value === undefined) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is required for students` });
        }
      }
    } else {
      for (const [key, value] of Object.entries(studentFields)) {
        if (value !== undefined) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is only valid for students` });
        }
      }
    }
  });
export type InvitationCreateInput = z.infer<typeof InvitationCreateSchema>;

export const ActivateRequestSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type ActivateRequestInput = z.infer<typeof ActivateRequestSchema>;

export const LoginRequestSchema = z.object({
  tenantSlug: z.string().min(1),
  emailOrUsn: z.string().min(1),
  password: z.string().min(1),
});
export type LoginRequestInput = z.infer<typeof LoginRequestSchema>;

export const PasswordResetRequestSchema = z.object({
  tenantSlug: z.string().min(1),
  emailOrUsn: z.string().min(1),
});
export type PasswordResetRequestInput = z.infer<typeof PasswordResetRequestSchema>;

export const PasswordResetCompleteSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type PasswordResetCompleteInput = z.infer<typeof PasswordResetCompleteSchema>;
