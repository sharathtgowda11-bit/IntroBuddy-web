import { ArrowRight, Building2, CheckCircle2, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useState, type FormEvent, type InputHTMLAttributes } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSession } from "../context/sessionContext.js";
import { apiPost, ApiError } from "../lib/apiClient.js";
import type { LoginPortalConfig } from "../lib/loginPortals.js";
import { Logo } from "./Logo.js";
import { Button } from "./ui/button.js";
import { Card, CardContent } from "./ui/card.js";
import { Checkbox } from "./ui/checkbox.js";
import { Input } from "./ui/input.js";
import { Label } from "./ui/label.js";

/** A subtle dot-grid texture for the left panel -- purely decorative. */
const DOT_GRID_STYLE = {
  backgroundImage: "radial-gradient(hsl(var(--border)) 1px, transparent 1px)",
  backgroundSize: "20px 20px",
};

interface LoginResponse {
  token: string;
}

function IconInput({ icon: Icon, ...props }: InputHTMLAttributes<HTMLInputElement> & { icon: typeof Mail }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input className="pl-9" {...props} />
    </div>
  );
}

/**
 * The shared login page for every role -- one implementation, parametrized
 * by `portal` (branding copy, icon, accent, and the role it's gated to).
 * The wire contract (POST /auth/login, GET /auth/session via
 * loginWithToken, session storage, permissions) is entirely unchanged from
 * the single shared login page this replaces -- the only new step is
 * checking the resolved session's role matches this portal before keeping
 * it, immediately signing out and showing a friendly error otherwise.
 *
 * `variant="admin"` (used only by the private /admin/login page) swaps the
 * wire contract to POST /auth/admin-login with just { email, password } --
 * no College ID field, since the server resolves the one possible tenant
 * (the platform sentinel) itself. Everything else -- session handling,
 * role-mismatch guard, styling -- is identical to the ordinary portal flow.
 */
export function RoleLoginPage({ portal, variant = "portal" }: { portal: LoginPortalConfig; variant?: "portal" | "admin" }) {
  const navigate = useNavigate();
  const { loginWithToken, logout } = useSession();
  const [tenantSlug, setTenantSlug] = useState("");
  const [emailOrUsn, setEmailOrUsn] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const Icon = portal.icon;
  const isAdmin = variant === "admin";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const { token } = isAdmin
        ? await apiPost<LoginResponse>("/auth/admin-login", { email: emailOrUsn, password })
        : await apiPost<LoginResponse>("/auth/login", { tenantSlug, emailOrUsn, password });
      const resolvedSession = await loginWithToken(token, remember);
      if (!resolvedSession) {
        setError("Something went wrong. Please try again.");
        return;
      }
      if (resolvedSession.role !== portal.role) {
        // A real session was briefly established (needed to learn the
        // role at all, since /auth/login deliberately never returns one) --
        // tear it back down immediately rather than let a wrong-portal
        // login stand.
        logout();
        setError(`This account does not belong to the ${portal.portalLabel}. Please use the appropriate login page.`);
        return;
      }
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-muted p-12 lg:flex">
        <div className="pointer-events-none absolute inset-0" style={DOT_GRID_STYLE} />
        <div className="relative">
          <div className="mb-10 flex items-center gap-2.5">
            <Logo className="h-9 w-9" />
            <span className="text-xl font-semibold text-brand">IntroBuddy</span>
          </div>
          <h1 className="text-4xl font-bold leading-tight text-brand">{portal.heading}</h1>
          <p className="mt-4 max-w-sm text-muted-foreground">{portal.description}</p>
        </div>
        <div className="relative rounded-lg border bg-card p-6 shadow-sm">
          <p className="mb-4 text-sm font-medium text-muted-foreground">{portal.portalLabel}</p>
          <ul className="space-y-3">
            {portal.valueProps.map((text) => (
              <li key={text} className="flex items-start gap-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center gap-2.5 lg:hidden">
            <div className="flex items-center gap-2.5">
              <Logo className="h-8 w-8" />
              <span className="text-xl font-semibold text-brand">IntroBuddy</span>
            </div>
          </div>

          <Card className="border-none shadow-lg lg:border lg:shadow-sm">
            <CardContent className="pt-6">
              <div className={`mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${portal.chipClassName}`}>
                <Icon className="h-3.5 w-3.5" />
                {portal.portalLabel}
              </div>
              <h2 className="text-2xl font-semibold">Sign in to your account</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {isAdmin ? "Enter your email and password." : "Enter your college's ID, your email, and your password."}
              </p>

              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                {!isAdmin && (
                  <div className="space-y-2">
                    <Label htmlFor="tenantSlug">College ID</Label>
                    <IconInput
                      icon={Building2}
                      id="tenantSlug"
                      value={tenantSlug}
                      onChange={(e) => setTenantSlug(e.target.value)}
                      placeholder="e.g. rvce"
                      required
                      autoFocus
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="emailOrUsn">Email</Label>
                  <IconInput
                    icon={Mail}
                    id="emailOrUsn"
                    type="email"
                    value={emailOrUsn}
                    onChange={(e) => setEmailOrUsn(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoFocus={isAdmin}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link to="/forgot-password" className="text-xs text-brand hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9 pr-9"
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="remember" checked={remember} onCheckedChange={(checked) => setRemember(checked === true)} />
                  <Label htmlFor="remember" className="font-normal text-muted-foreground">
                    Remember this device
                  </Label>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" variant="brand" size="lg" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Signing in…" : "Sign in"}
                  {!isSubmitting && <ArrowRight className="h-4 w-4" />}
                </Button>
              </form>

              {!isAdmin && (
                <Link to="/login" className="mt-6 block text-center text-sm text-muted-foreground hover:text-foreground">
                  ← Choose a different portal
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
