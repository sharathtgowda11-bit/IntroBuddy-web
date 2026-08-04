import type { IncomingMessage } from "node:http";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * /alumni, /alumni-directory, and /requests are both real API prefixes AND
 * real frontend route paths (/alumni/dashboard, /alumni-directory,
 * /requests) -- a plain prefix proxy can't tell "browser loaded/refreshed
 * this page" from "apiClient.ts fetched this API" since they're the same
 * URL. A top-level page navigation always sends `text/html` in its Accept
 * header; apiClient.ts's fetch() calls never do. Use that to send page
 * loads back to Vite's own SPA shell instead of proxying them to the API,
 * which would otherwise render raw JSON instead of the app.
 */
function bypassPageNavigations(req: IncomingMessage): string | undefined {
  if (req.headers.accept?.includes("text/html")) {
    return "/index.html";
  }
  return undefined;
}

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
    proxy: {
      ...Object.fromEntries(
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
        ].map((prefix) => [prefix, { target: "http://127.0.0.1:3001", changeOrigin: true }]),
      ),
      // Phase 2 (Alumni Module) -- these prefixes collide with this app's
      // own frontend routes, so they need the bypass above; the others
      // above never do (no frontend route shares those names).
      ...Object.fromEntries(
        ["/alumni", "/alumni-directory", "/opportunities", "/requests"].map((prefix) => [
          prefix,
          { target: "http://127.0.0.1:3001", changeOrigin: true, bypass: bypassPageNavigations },
        ]),
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/testSetup.ts"],
  },
});
