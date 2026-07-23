import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Loads the repo-root .env for local dev/test convenience. Silently does
 * nothing if the file doesn't exist -- unlike Node's --env-file flag,
 * which throws -- so this is safe to import unconditionally, including
 * in production, where real env vars come from the hosting platform and
 * no .env file exists at all.
 */
const currentDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(currentDir, "../../../.env"), quiet: true });
