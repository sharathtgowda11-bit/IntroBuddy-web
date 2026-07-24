import { PERMISSIONS } from "@introbuddy/shared";
import { CheckCircle2, Info } from "lucide-react";
import { useState, type FormEvent } from "react";
import { PageHeader } from "../components/PageHeader.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { useSession } from "../context/sessionContext.js";
import { apiPost, ApiError } from "../lib/apiClient.js";

export function ReinviteCollegeAdmin() {
  const { can } = useSession();
  const [tenantId, setTenantId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!can(PERMISSIONS.COLLEGE_CREATE)) {
    return <p className="text-muted-foreground">You don't have access to this page.</p>;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    try {
      await apiPost(`/colleges/${tenantId}/reinvite-admin`, {});
      setMessage("A new activation email has been sent to the college admin.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resend Admin Activation"
        description="Re-send an activation link when a college admin's original link expired or never arrived."
      />
      <Card className="max-w-lg">
        <CardContent className="space-y-5 pt-6">
          <div className="flex gap-3 rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <span>
              You'll need the <span className="font-medium text-foreground">Tenant ID</span> shown when the college was
              created. It's also on the college's row detail if you've lost it.
            </span>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="tenantId">Tenant ID</Label>
              <Input
                id="tenantId"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="e.g. 6b1b1ec3-aa0c-4e73-9622-239568e81f45"
                required
                autoFocus
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {message && (
              <div className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{message}</span>
              </div>
            )}

            <Button type="submit" variant="brand" size="lg" disabled={isSubmitting}>
              {isSubmitting ? "Sending…" : "Resend activation"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
