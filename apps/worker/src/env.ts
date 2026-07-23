import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  // Read directly from process.env by packages/invitations (identity.ts,
  // email.ts) and packages/jobs (importStorage.ts) -- validated here too
  // so the worker fails fast at boot rather than on its first job.
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().min(1),
  WEB_APP_URL: z.string().url(),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  IMPORT_COMMIT_CHUNK_SIZE: z.coerce.number().int().positive().default(200),
  INVITATION_SEND_CHUNK_SIZE: z.coerce.number().int().positive().default(10),
  // Spec 10.7's own starting number.
  INVITATION_SEND_RATE_PER_HOUR: z.coerce.number().int().positive().default(200),
});

export type Env = z.infer<typeof EnvSchema>;

let cachedEnv: Env | undefined;

/** Fail-fast env parsing -- called once at boot, never mid-job. */
export function getEnv(): Env {
  if (!cachedEnv) {
    const result = EnvSchema.safeParse(process.env);
    if (!result.success) {
      throw new Error(`Invalid environment configuration: ${result.error.message}`);
    }
    cachedEnv = result.data;
  }
  return cachedEnv;
}
