import { z } from "zod";

// Mirrors packages/import's TargetField union -- duplicated here rather
// than imported, since packages/shared is a base package that packages/import
// itself depends on (indirectly, via apps/api); the six field names are
// fixed and unlikely to drift.
export const ColumnMappingSchema = z.object({
  name: z.string().min(1).optional(),
  usn: z.string().min(1).optional(),
  email: z.string().min(1).optional(),
  degree: z.string().min(1).optional(),
  department: z.string().min(1).optional(),
  graduationYear: z.string().min(1).optional(),
});
export type ColumnMappingInput = z.infer<typeof ColumnMappingSchema>;

export const ImportMappingUpdateSchema = z.object({
  columnMapping: ColumnMappingSchema,
});
export type ImportMappingUpdateInput = z.infer<typeof ImportMappingUpdateSchema>;

// The client must re-confirm how many students it expects to email --
// spec's bulk-send safeguard against sending based on stale counts (a
// mismatch means something changed between commit and this call).
export const ImportSendInvitationsSchema = z.object({
  expectedCount: z.number().int().nonnegative(),
});
export type ImportSendInvitationsInput = z.infer<typeof ImportSendInvitationsSchema>;
