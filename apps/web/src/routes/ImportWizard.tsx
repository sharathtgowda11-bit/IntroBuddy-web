import { PERMISSIONS } from "@introbuddy/shared";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Select } from "../components/ui/select.js";
import { useSession } from "../context/sessionContext.js";
import { apiGet, apiPatch, apiPost, apiPostMultipart, ApiError } from "../lib/apiClient.js";

type ImportJobPhase = "uploaded" | "mapped" | "validated" | "committing" | "committed" | "failed";
type MappingField = "name" | "usn" | "email" | "company" | "degree" | "department" | "graduationYear";
type MappingDraft = Partial<Record<MappingField, string>>;
export type ImportTargetRole = "student" | "alumni";

interface ImportJobState {
  id: string;
  phase: ImportJobPhase;
  columnMapping: MappingDraft;
  // Only ever populated from the upload response -- GET /import-jobs/:id
  // doesn't return the file's headers, so a page reload while still in
  // the "uploaded" (mapping) phase can't re-render the mapping selects.
  headers?: string[];
  rowCount: number | null;
  validCount: number | null;
  invalidCount: number | null;
  createCount: number | null;
  updateCount: number | null;
  committedRowCount: number | null;
  errorMessage: string | null;
}

interface UploadResponse extends ImportJobState {
  headers: string[];
}

const STUDENT_TARGET_FIELDS: { field: MappingField; label: string }[] = [
  { field: "name", label: "Name" },
  { field: "usn", label: "USN" },
  { field: "email", label: "Email" },
  { field: "degree", label: "Degree" },
  { field: "department", label: "Department" },
  { field: "graduationYear", label: "Graduation year" },
];

// Phase 2: no USN (alumni have none), plus a company column -- required
// for the import to validate and shown in the review step, but never
// persisted after commit (the alumnus's own Company field is entered
// later, at profile Step 3).
const ALUMNI_TARGET_FIELDS: { field: MappingField; label: string }[] = [
  { field: "name", label: "Name" },
  { field: "email", label: "Email" },
  { field: "company", label: "Company (at time of import)" },
  { field: "degree", label: "Degree" },
  { field: "department", label: "Department" },
  { field: "graduationYear", label: "Graduation year" },
];

const POLL_INTERVAL_MS = 2500;

/**
 * Handles both the student and alumni bulk-import wizards -- same
 * six-phase UI, parametrized by targetRole rather than duplicated. The
 * two mounting routes (/college/import(/:jobId) and
 * /college/import-alumni(/:jobId)) each pass a fixed targetRole prop.
 */
export function ImportWizard({ targetRole = "student" }: { targetRole?: ImportTargetRole }) {
  const { can } = useSession();
  const { jobId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const isAlumni = targetRole === "alumni";
  const basePath = isAlumni ? "/college/import-alumni" : "/college/import";
  const targetFields = isAlumni ? ALUMNI_TARGET_FIELDS : STUDENT_TARGET_FIELDS;
  const permission = isAlumni ? PERMISSIONS.ALUMNI_IMPORT : PERMISSIONS.STUDENT_IMPORT;
  const entityPlural = isAlumni ? "alumni" : "students";
  const entityLabel = isAlumni ? "Alumni" : "Student";

  // Navigating from the upload step to :basePath/:jobId remounts this
  // component (react-router renders a different <Route>), so the
  // freshly-uploaded job -- including the file `headers` that GET
  // /import-jobs/:id doesn't return -- is carried across via navigation
  // state rather than being lost.
  const [job, setJob] = useState<ImportJobState | null>(
    () => (location.state as { job?: ImportJobState } | null)?.job ?? null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [mappingDraft, setMappingDraft] = useState<MappingDraft>({});
  const [inviteRetryCount, setInviteRetryCount] = useState<number | null>(null);
  const [inviteConfirmation, setInviteConfirmation] = useState<string | null>(null);
  const mappingSyncedForJobId = useRef<string | null>(null);

  // Resumes an in-progress job on a fresh page load (e.g. after a
  // refresh). Skipped once `job` already holds this exact job -- notably
  // right after upload, where `job` is set locally (with `headers`)
  // before navigating here, and refetching would silently drop them.
  useEffect(() => {
    if (!jobId || (job && job.id === jobId)) return;
    apiGet<ImportJobState>(`/import-jobs/${jobId}`)
      .then((data) => setJob((prev) => (prev && prev.id === jobId ? prev : data)))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load this import."));
  }, [jobId, job]);

  useEffect(() => {
    if (job && job.phase === "uploaded" && job.headers && mappingSyncedForJobId.current !== job.id) {
      mappingSyncedForJobId.current = job.id;
      setMappingDraft(job.columnMapping);
    }
  }, [job]);

  const committingJobId = job?.phase === "committing" ? job.id : null;
  useEffect(() => {
    if (!committingJobId) return;
    const interval = setInterval(() => {
      apiGet<ImportJobState>(`/import-jobs/${committingJobId}`)
        .then((data) => setJob((prev) => (prev ? { ...prev, ...data } : prev)))
        .catch(() => {
          /* transient poll failure -- retried next tick */
        });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [committingJobId]);

  if (!can(permission)) {
    return <p className="text-muted-foreground">You don't have access to this page.</p>;
  }

  async function handleUpload() {
    setError(null);
    if (!uploadFile) {
      setError("Choose a .csv or .xlsx file first.");
      return;
    }
    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("targetRole", targetRole);

    setIsBusy(true);
    try {
      const response = await apiPostMultipart<UploadResponse>("/import-jobs", formData);
      // Set state directly (covers react-router reusing this instance) AND
      // pass it via navigation state (covers a remount, which drops
      // in-memory state) -- either way `job` survives the route change with
      // its `headers`, which GET /import-jobs/:id can't re-supply.
      setJob(response);
      navigate(`${basePath}/${response.id}`, { replace: true, state: { job: response } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleConfirmMapping() {
    if (!job) return;
    setError(null);
    setIsBusy(true);
    try {
      await apiPatch(`/import-jobs/${job.id}/mapping`, { columnMapping: mappingDraft });
      const refreshed = await apiGet<ImportJobState>(`/import-jobs/${job.id}`);
      setJob((prev) => (prev ? { ...prev, ...refreshed } : refreshed));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleValidate() {
    if (!job) return;
    setError(null);
    setIsBusy(true);
    try {
      const result = await apiPost<{
        phase: ImportJobPhase;
        rowCount: number;
        validCount: number;
        invalidCount: number;
        createCount: number;
        updateCount: number;
      }>(`/import-jobs/${job.id}/validate`, {});
      setJob((prev) => (prev ? { ...prev, ...result } : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDownloadErrors() {
    if (!job) return;
    setError(null);
    try {
      const csvText = await apiGet<string>(`/import-jobs/${job.id}/errors.csv`);
      const blob = new Blob([csvText], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "import-errors.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not download errors.");
    }
  }

  async function handleCommit() {
    if (!job) return;
    setError(null);
    setIsBusy(true);
    try {
      await apiPost(`/import-jobs/${job.id}/commit`, {});
      setJob((prev) => (prev ? { ...prev, phase: "committing" } : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSendInvitations(expectedCount: number) {
    if (!job) return;
    setError(null);
    setInviteRetryCount(null);
    setIsBusy(true);
    try {
      await apiPost<{ status: string; recipientCount: number }>(`/import-jobs/${job.id}/send-invitations`, {
        expectedCount,
      });
      setInviteConfirmation("Invitations are being sent in the background — this can take a while for large imports.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const details = err.details;
        const actualCount =
          details && typeof details === "object" && "actualCount" in details
            ? (details as { actualCount: number }).actualCount
            : null;
        if (actualCount !== null) {
          setInviteRetryCount(actualCount);
        }
        setError(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      }
    } finally {
      setIsBusy(false);
    }
  }

  function startNewImport() {
    setJob(null);
    setError(null);
    setLoadError(null);
    setInviteConfirmation(null);
    setInviteRetryCount(null);
    navigate(basePath, { replace: true });
  }

  if (jobId && loadError) {
    return (
      <Card className="max-w-lg">
        <CardContent className="pt-6 space-y-4">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" onClick={startNewImport}>
            Start a new import
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (jobId && !job) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  if (!job) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Import {entityPlural}</CardTitle>
          <CardDescription>Upload a .csv or .xlsx roster to bulk-invite {entityPlural}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">Roster file</Label>
            <Input
              id="file"
              name="file"
              type="file"
              accept=".csv,.xlsx"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={handleUpload} disabled={isBusy}>
            {isBusy ? "Uploading…" : "Upload"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (job.phase === "uploaded") {
    const headers = job.headers;
    if (!headers) {
      return (
        <Card className="max-w-lg">
          <CardContent className="pt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              This import's file headers aren't available after a page reload. Please start a new import.
            </p>
            <Button variant="outline" onClick={startNewImport}>
              Start a new import
            </Button>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Map columns</CardTitle>
          <CardDescription>Match each field to a column from your file.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {targetFields.map(({ field, label }) => (
            <div key={field} className="space-y-2">
              <Label htmlFor={field}>{label}</Label>
              <Select
                id={field}
                value={mappingDraft[field] ?? ""}
                onChange={(e) => setMappingDraft((prev) => ({ ...prev, [field]: e.target.value || undefined }))}
              >
                <option value="">— none —</option>
                {headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </Select>
            </div>
          ))}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={handleConfirmMapping} disabled={isBusy}>
            {isBusy ? "Saving…" : "Confirm mapping"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (job.phase === "mapped") {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Validate</CardTitle>
          <CardDescription>
            Check every row against your college's {entityPlural}
            {isAlumni ? "" : " and department list"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={handleValidate} disabled={isBusy}>
            {isBusy ? "Validating…" : "Run validation"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (job.phase === "validated") {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Review</CardTitle>
          <CardDescription>{job.rowCount} rows checked.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>Valid: {job.validCount}</li>
            <li>Invalid: {job.invalidCount}</li>
            <li>New {entityPlural}: {job.createCount}</li>
            <li>Updated {entityPlural}: {job.updateCount}</li>
          </ul>
          {!!job.invalidCount && (
            <Button variant="outline" onClick={handleDownloadErrors}>
              Download errors CSV
            </Button>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={handleCommit} disabled={isBusy || !job.validCount}>
            {isBusy ? "Starting…" : "Commit"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (job.phase === "committing") {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Creating {entityLabel.toLowerCase()} accounts…</CardTitle>
          <CardDescription>This can take a moment for large files.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (job.phase === "committed") {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Accounts created</CardTitle>
          <CardDescription>{job.committedRowCount} {entityLabel.toLowerCase()} accounts were created or updated.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {inviteConfirmation ? (
            <p className="text-sm text-success">{inviteConfirmation}</p>
          ) : (
            <>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                onClick={() => handleSendInvitations(inviteRetryCount ?? job.committedRowCount ?? 0)}
                disabled={isBusy}
              >
                {isBusy ? "Sending…" : inviteRetryCount !== null ? `Retry with ${inviteRetryCount}` : "Send invitations"}
              </Button>
            </>
          )}
          <div>
            <Button variant="outline" onClick={startNewImport}>
              Start a new import
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Import failed</CardTitle>
        <CardDescription>{job.errorMessage}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={startNewImport}>
          Start a new import
        </Button>
      </CardContent>
    </Card>
  );
}
