import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout.js";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { apiPost } from "../lib/apiClient.js";

export function ForgotPassword() {
  const [tenantSlug, setTenantSlug] = useState("");
  const [emailOrUsn, setEmailOrUsn] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Always the same message regardless of outcome (spec 8.6) -- the
  // backend's own response is deliberately identical whether or not the
  // account exists, so the UI must never distinguish either.
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await apiPost("/auth/reset/request", { tenantSlug, emailOrUsn });
    } finally {
      setIsSubmitting(false);
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <AuthLayout title="Check your email" description="">
        <p className="text-sm text-muted-foreground">
          If an account exists for that college and identifier, we've sent a password reset link. It expires in 1
          hour.
        </p>
        <Link to="/login" className="mt-4 inline-block text-sm text-brand hover:underline">
          Back to sign in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset your password" description="Enter your college ID and your email or USN.">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="tenantSlug">College ID</Label>
          <Input
            id="tenantSlug"
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="emailOrUsn">Email or USN</Label>
          <Input id="emailOrUsn" value={emailOrUsn} onChange={(e) => setEmailOrUsn(e.target.value)} required />
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Sending…" : "Send reset link"}
        </Button>
        <Link to="/login" className="block text-center text-sm text-brand hover:underline">
          Back to sign in
        </Link>
      </form>
    </AuthLayout>
  );
}
