import type { Permission, Role } from "@introbuddy/shared";
import { createContext, useContext } from "react";

/** Matches GET /auth/session's response shape exactly. */
export interface SessionInfo {
  tenantId: string;
  tenantSlug: string | null;
  collegeUserId: string;
  role: Role;
  email: string;
  name: string | null;
}

export interface SessionContextValue {
  session: SessionInfo | null;
  /** True only while the initial session resolution (on load, or right after login) is in flight. */
  isLoading: boolean;
  /** Returns the resolved session so callers (e.g. a role-specific login page) can validate it before deciding whether to keep it. */
  loginWithToken: (token: string, remember?: boolean) => Promise<SessionInfo | null>;
  logout: () => void;
  /** Reuses the exact same hasPermission the backend enforces -- not a re-implementation. */
  can: (permission: Permission) => boolean;
}

export const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return ctx;
}
