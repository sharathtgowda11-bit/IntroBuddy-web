import { PERMISSIONS, type CollegeCreateInput } from "@introbuddy/shared";
import { Check, CheckCircle2, Copy } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { PageHeader } from "../components/PageHeader.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent } from "../components/ui/card.js";
import { Combobox, type ComboboxOption } from "../components/ui/combobox.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { useSession } from "../context/sessionContext.js";
import { INDIA_STATES_AND_CITIES } from "../data/indiaStatesCities.js";
import { apiPost, ApiError } from "../lib/apiClient.js";

const STATE_OPTIONS: ComboboxOption[] = INDIA_STATES_AND_CITIES.map((s) => ({ value: s.name, label: s.name }));

interface CreateCollegeResponse {
  id: string;
  slug: string;
  status: string;
}

const emptyForm: CollegeCreateInput = { name: "", shortName: "", state: "", city: "", adminName: "", adminEmail: "" };

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable (e.g. insecure context) -- fail quietly.
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
        <span className="truncate font-mono text-sm">{value}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label}`}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h2>
      {children}
    </section>
  );
}

export function CreateCollege() {
  const { can } = useSession();
  const [form, setForm] = useState<CollegeCreateInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState<CreateCollegeResponse | null>(null);
  const [createdAdminEmail, setCreatedAdminEmail] = useState("");

  const cityOptions: ComboboxOption[] = useMemo(() => {
    const selected = INDIA_STATES_AND_CITIES.find((s) => s.name === form.state);
    return selected ? selected.cities.map((city) => ({ value: city, label: city })) : [];
  }, [form.state]);

  if (!can(PERMISSIONS.COLLEGE_CREATE)) {
    return <p className="text-muted-foreground">You don't have access to this page.</p>;
  }

  function updateField<K extends keyof CollegeCreateInput>(field: K, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleStateChange(state: string) {
    // Changing (or clearing) the state invalidates whatever city was
    // selected under the previous state -- never leave a stale city value
    // committed for a state that no longer matches it.
    setForm((prev) => ({ ...prev, state, city: "" }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await apiPost<CreateCollegeResponse>("/colleges", form);
      setCreatedAdminEmail(form.adminEmail);
      setCreated(response);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (created) {
    return (
      <div className="space-y-6">
        <PageHeader title="Create a College" description="Onboard a new college and invite its administrator." />
        <Card className="max-w-lg">
          <CardContent className="space-y-5 pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">College created</p>
                <p className="text-sm text-muted-foreground">An activation email has been sent to {createdAdminEmail}.</p>
              </div>
            </div>

            <CopyField label="College ID" value={created.slug} />
            <CopyField label="Tenant ID" value={created.id} />

            <p className="text-sm text-muted-foreground">
              Share the <span className="font-medium text-foreground">College ID</span> with the admin — they'll need it
              every time they log in. Keep the <span className="font-medium text-foreground">Tenant ID</span> if you need
              to resend their activation email later.
            </p>

            <Button
              variant="outline"
              onClick={() => {
                setCreated(null);
                setForm(emptyForm);
              }}
            >
              Create another college
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Create a College" description="Onboard a new college and invite its administrator." />
      <Card className="max-w-2xl">
        <CardContent className="pt-6">
          <form className="space-y-8" onSubmit={handleSubmit}>
            <FieldGroup label="College details">
              <div className="space-y-2">
                <Label htmlFor="name">College Full Name</Label>
                <Input id="name" value={form.name} onChange={(e) => updateField("name", e.target.value)} required autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shortName">College Short Name</Label>
                <Input
                  id="shortName"
                  value={form.shortName}
                  onChange={(e) => updateField("shortName", e.target.value)}
                  placeholder="e.g. GMIT, BIET"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  This becomes the college's unique ID, used to sign in. Must be different from every other college's.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Combobox
                    id="state"
                    options={STATE_OPTIONS}
                    value={form.state}
                    onChange={handleStateChange}
                    placeholder="Search for a state or UT…"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Combobox
                    id="city"
                    options={cityOptions}
                    value={form.city}
                    onChange={(city) => updateField("city", city)}
                    placeholder={form.state ? "Search for a city…" : "Choose a state first"}
                    disabled={!form.state}
                    required
                    allowCustomEntry
                  />
                </div>
              </div>
            </FieldGroup>

            <FieldGroup label="Administrator">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="adminName">Admin name</Label>
                  <Input
                    id="adminName"
                    value={form.adminName}
                    onChange={(e) => updateField("adminName", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminEmail">Admin email</Label>
                  <Input
                    id="adminEmail"
                    type="email"
                    value={form.adminEmail}
                    onChange={(e) => updateField("adminEmail", e.target.value)}
                    required
                  />
                </div>
              </div>
            </FieldGroup>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" variant="brand" size="lg" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create college"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
