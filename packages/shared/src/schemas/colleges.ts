import { z } from "zod";

export const CollegeCreateSchema = z.object({
  // .trim() before .min(1): a name/state/city/adminName made only of
  // whitespace must fail validation rather than being stored verbatim --
  // it would otherwise pass min(1) and leak stray leading/trailing
  // whitespace into user-facing copy (activation emails, dashboards, etc.).
  name: z.string().trim().min(1),
  state: z.string().trim().min(1),
  city: z.string().trim().min(1),
  adminName: z.string().trim().min(1),
  adminEmail: z.string().email(),
});
export type CollegeCreateInput = z.infer<typeof CollegeCreateSchema>;

// Description and contact are optional per spec section 8.2's setup gates.
export const CollegeProfileUpdateSchema = z.object({
  description: z.string().max(2000).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().min(1).optional(),
});
export type CollegeProfileUpdateInput = z.infer<typeof CollegeProfileUpdateSchema>;
