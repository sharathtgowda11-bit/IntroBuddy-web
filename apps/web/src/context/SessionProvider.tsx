import { hasPermission, type Permission } from "@introbuddy/shared";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiGet, getStoredToken, setStoredToken } from "../lib/apiClient.js";
import { SessionContext, type SessionInfo } from "./sessionContext.js";

/** Fetches and validates the current token; clears it and returns null on any failure. Not a hook -- safe to call from an effect's async callback or an event handler alike. */
async function fetchSession(): Promise<SessionInfo | null> {
  try {
    return await apiGet<SessionInfo>("/auth/session");
  } catch {
    setStoredToken(null);
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  // Lazy initializer keeps the "no token" case synchronous and correct on
  // first render -- only genuinely async work (an existing token needing
  // /auth/session validation) belongs in the effect below.
  const [isLoading, setIsLoading] = useState<boolean>(() => getStoredToken() !== null);

  useEffect(() => {
    if (!getStoredToken()) {
      return;
    }
    let cancelled = false;
    fetchSession().then((resolved) => {
      if (!cancelled) {
        setSession(resolved);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loginWithToken = useCallback(async (token: string) => {
    setStoredToken(token);
    setIsLoading(true);
    const resolved = await fetchSession();
    setSession(resolved);
    setIsLoading(false);
  }, []);

  const logout = useCallback(() => {
    setStoredToken(null);
    setSession(null);
  }, []);

  const can = useCallback((permission: Permission) => (session ? hasPermission(session.role, permission) : false), [session]);

  const value = useMemo(
    () => ({ session, isLoading, loginWithToken, logout, can }),
    [session, isLoading, loginWithToken, logout, can],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
