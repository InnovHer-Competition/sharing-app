import type { AuthResponse, PcosRecord, PublicUser, RecordInput, Role, UserSummary } from "@pcos/shared";

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
export const API_URL = (configuredApiUrl || (import.meta.env.DEV ? "http://localhost:8787" : "")).replace(/\/$/, "");
export const API_CONFIGURED = API_URL !== "";

const NOT_CONFIGURED =
  "This site isn't connected to an API server yet. Deploy apps/server, set the API_URL repository variable to its URL, and redeploy.";

const TOKEN_KEY = "pcos-app:token";

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Storage unavailable: the session lasts until the tab closes.
    }
  },
};

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!API_CONFIGURED) throw new ApiError(0, NOT_CONFIGURED);
  const token = tokenStore.get();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, { ...init, headers });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status}).`);
  }
  return res;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  return res.status === 204 ? (undefined as T) : res.json();
}

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  signUp: (input: { name: string; email: string; password: string; role: Role }) =>
    json<AuthResponse>("/auth/signup", send("POST", input)),
  signIn: (email: string, password: string) => json<AuthResponse>("/auth/signin", send("POST", { email, password })),
  me: () => json<{ user: PublicUser }>("/auth/me"),

  records: (patientId?: string) =>
    json<{ records: PcosRecord[] }>(`/records${patientId ? `?patientId=${encodeURIComponent(patientId)}` : ""}`),
  record: (id: string) => json<{ record: PcosRecord }>(`/records/${id}`),
  createRecord: (input: RecordInput) => json<{ record: PcosRecord }>("/records", send("POST", input)),
  updateRecord: (id: string, input: Omit<RecordInput, "patientId">) =>
    json<{ record: PcosRecord }>(`/records/${id}`, send("PUT", input)),
  deleteRecord: (id: string) => json<void>(`/records/${id}`, send("DELETE")),

  patients: () => json<{ patients: UserSummary[] }>("/patients"),
};
