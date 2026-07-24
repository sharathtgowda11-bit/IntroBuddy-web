const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";
const SESSION_TOKEN_KEY = "introbuddy.sessionToken";

/**
 * The session token is an opaque compound bearer token
 * ("<tenantId>.<rawToken>") the backend hands back from /auth/login --
 * there's no cookie flow on the API to match, so localStorage + a
 * replayed Authorization header is the whole session mechanism.
 */
export function getStoredToken(): string | null {
  return localStorage.getItem(SESSION_TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(SESSION_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(SESSION_TOKEN_KEY);
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

function authHeaders(): HeadersInit {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) query.set(key, String(value));
    }
  }
  const queryString = query.toString();
  return `${API_BASE_URL}${path}${queryString ? `?${queryString}` : ""}`;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, body);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
}

export async function apiGet<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const response = await fetch(buildUrl(path, params), { headers: authHeaders() });
  return handleResponse<T>(response);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(buildUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(response);
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(buildUrl(path), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(response);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(buildUrl(path), { method: "DELETE", headers: authHeaders() });
  return handleResponse<T>(response);
}

/** Never set Content-Type manually for multipart -- the browser sets its own boundary. */
export async function apiPostMultipart<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(buildUrl(path), { method: "POST", headers: authHeaders(), body: formData });
  return handleResponse<T>(response);
}

export async function apiPatchMultipart<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(buildUrl(path), { method: "PATCH", headers: authHeaders(), body: formData });
  return handleResponse<T>(response);
}
