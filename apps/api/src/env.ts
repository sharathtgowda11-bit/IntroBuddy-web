import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().min(1),
  WEB_APP_URL: z.string().url(),
  BREACHED_PASSWORD_CHECK_ENABLED: z
    .string()
    .default("true")
    .transform((value) => value === "true"),
  PORT: z.coerce.number().int().positive().default(3001),
});

export type Env = z.infer<typeof EnvSchema>;

let cachedEnv: Env | undefined;

/** Fail-fast env parsing -- called once at boot, never mid-request. */
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
