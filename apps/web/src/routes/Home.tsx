import { useSession } from "../context/sessionContext.js";

/**
 * A placeholder authenticated home screen -- proves the full
 * login -> session-resolve -> shell -> logout loop works end to end.
 * The real dashboard/profile/admin screens are later phases, built on
 * this same shell.
 */
export function Home() {
  const { session } = useSession();

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Welcome{session?.name ? `, ${session.name}` : ""}</h1>
      <p className="text-muted-foreground">
        Signed in as <span className="font-medium text-foreground">{session?.email}</span> ({session?.role})
      </p>
    </div>
  );
}
