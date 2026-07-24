import { z } from "zod";

// departmentId only -- degreeId is always derived server-side from the
// department, same principle as InvitationCreateSchema (never accepted
// as separate client input).
export const StudentEditSchema = z.object({
  name: z.string().min(1).optional(),
  usn: z.string().min(1).optional(),
  departmentId: z.string().uuid().optional(),
  graduationYear: z.number().int().optional(),
});
export type StudentEditInput = z.infer<typeof StudentEditSchema>;

// Bidirectional (active <-> deactivated) so the same endpoint covers both
// deactivating and reactivating a student -- spec never mentions
// "reactivate" separately, but a one-way deactivate-only endpoint would
// leave no way back.
export const StudentStatusUpdateSchema = z.object({
  status: z.enum(["active", "deactivated"]),
});
export type StudentStatusUpdateInput = z.infer<typeof StudentStatusUpdateSchema>;
