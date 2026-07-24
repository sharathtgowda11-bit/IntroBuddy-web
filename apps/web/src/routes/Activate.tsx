import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout.js";
import { Button } from "../components/ui/button.js";
import { Checkbox } from "../components/ui/checkbox.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { apiPost, ApiError } from "../lib/apiClient.js";

/**
 * Consent is only enforced server-side for students (spec 8.4) -- the
 * frontend has no way to know a given invitation's role ahead of
 * activation (the token is opaque), so the checkbox is always shown.
 * Non-student activations simply ignore it; this is a deliberate,
 * documented simplification for this first phase, not an oversight.
 */
export function Activate() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!consentAccepted) {
      setError("You must agree to the terms to activate your account.");
      return;
    }

    setIsSubmitting(true);
    try {
      await apiPost("/auth/activate", { token, password, consentAccepted });
      navigate("/login", { replace: true, state: { activated: true } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout title="Invalid link" description="This activation link is missing its token.">
        <p className="text-sm text-muted-foreground">
          Check the link in your email, or{" "}
          <Link to="/login" className="text-brand hover:underline">
            sign in
          </Link>{" "}
          if you've already activated.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Activate your account" description="Set a password to finish setting up your account.">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <div className="flex items-start gap-2">
          <Checkbox
            id="consentAccepted"
            checked={consentAccepted}
            onCheckedChange={(checked) => setConsentAccepted(checked === true)}
            className="mt-0.5"
          />
          <Label htmlFor="consentAccepted" className="text-sm font-normal leading-snug text-muted-foreground">
            I agree to IntroBuddy's Terms of Service and Privacy Policy, and understand my college provided my name
            and email to create this account.
          </Label>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Activating…" : "Activate account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
