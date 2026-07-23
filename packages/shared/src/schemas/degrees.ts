import { z } from "zod";

// Same shape serves both create and rename -- there's nothing else to a degree yet.
export const DegreeUpsertSchema = z.object({
  name: z.string().min(1),
});
export type DegreeUpsertInput = z.infer<typeof DegreeUpsertSchema>;

export const DepartmentUpsertSchema = z.object({
  degreeId: z.string().uuid(),
  name: z.string().min(1),
});
export type DepartmentUpsertInput = z.infer<typeof DepartmentUpsertSchema>;
