import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    // Matches WEB_APP_URL in .env.example/.env -- apps/api embeds this
    // origin directly into activation/reset links it emails out, so the
    // dev server must actually be reachable there or those links 404.
    // host must be the literal IPv4 loopback: leaving it unset resolves
    // "localhost" to the IPv6 loopback ([::1]) on this machine, which
    // silently refuses connections to the IPv4 127.0.0.1 those emailed
    // links use.
    host: "127.0.0.1",
    port: 3000,
    strictPort: true,
    // Local dev only -- proxies apps/api's own real route prefixes
    // (unchanged, no rewrite) so the browser never needs CORS configured
    // on the backend, and dev paths match production paths exactly
    // (apiClient.ts calls the same `/auth/login`-style paths in both).
    proxy: Object.fromEntries(
      [
        "/health",
        "/auth",
        "/invitations",
        "/colleges",
        "/degrees",
        "/departments",
        "/import-jobs",
        "/me",
        "/students",
        "/dashboard",
        "/audit-log",
        // Phase 2 (Alumni Module)
        "/alumni",
        "/alumni-directory",
        "/opportunities",
        "/requests",
      ].map((prefix) => [prefix, { target: "http://127.0.0.1:3001", changeOrigin: true }]),
    ),
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/testSetup.ts"],
  },
});
