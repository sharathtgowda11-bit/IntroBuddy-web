import { ArrowRight, Building2, Eye, EyeOff, GraduationCap, Lock, Mail, ShieldCheck, Users } from "lucide-react";
import { useState, type FormEvent, type InputHTMLAttributes } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Logo } from "../components/Logo.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent } from "../components/ui/card.js";
import { Checkbox } from "../components/ui/checkbox.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { useSession } from "../context/sessionContext.js";
import { apiPost, ApiError } from "../lib/apiClient.js";

/** A subtle dot-grid texture for the left panel -- purely decorative. */
const DOT_GRID_STYLE = {
  backgroundImage: "radial-gradient(hsl(var(--border)) 1px, transparent 1px)",
  backgroundSize: "20px 20px",
};

interface LoginResponse {
  token: string;
}

const VALUE_PROPS = [
  { icon: Users, text: "Connect students directly with verified alumni" },
  { icon: GraduationCap, text: "Streamlined onboarding for your whole college" },
  { icon: ShieldCheck, text: "Secure, tenant-isolated by design" },
];

function IconInput({ icon: Icon, ...props }: InputHTMLAttributes<HTMLInputElement> & { icon: typeof Mail }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input className="pl-9" {...props} />
    </div>
  );
}

export function Login() {
  const navigate = useNavigate();
  const { loginWithToken } = useSession();
  const [tenantSlug, setTenantSlug] = useState("");
  const [emailOrUsn, setEmailOrUsn] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const { token } = await apiPost<LoginResponse>("/auth/login", { tenantSlug, emailOrUsn, password });
      await loginWithToken(token, remember);
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
          <h1 className="text-4xl font-bold leading-tight text-brand">Connect students with the alumni who came before them.</h1>
          <p className="mt-4 max-w-sm text-muted-foreground">
            The central hub your college uses to onboard students and put them in touch with verified alumni.
          </p>
        </div>
        <div className="relative rounded-lg border bg-card p-6 shadow-sm">
          <p className="mb-4 text-sm font-medium text-muted-foreground">Why colleges choose IntroBuddy</p>
          <ul className="space-y-3">
            {VALUE_PROPS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center justify-center gap-2.5 lg:hidden">
            <Logo className="h-8 w-8" />
            <span className="text-xl font-semibold text-brand">IntroBuddy</span>
          </div>

          <Card className="border-none shadow-lg lg:border lg:shadow-sm">
            <CardContent className="pt-6">
              <h2 className="text-2xl font-semibold">Sign in to your account</h2>
              <p className="mt-1 text-sm text-muted-foreground">Enter your college's ID, your email, and your password.</p>

              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
