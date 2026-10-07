import type {
  AuthResponse,
  Block,
  GrantView,
  LedgerVerification,
  PcosRecord,
  PublicUser,
  RecordInput,
  Role,
  UserSummary,
} from "@pcos/shared";
import type { DeidentifiedRecord } from "@pcos/shared";

export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8787").replace(/\/$/, "");

const TOKEN_KEY = "pcos-ledger:token";

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
  walletNonce: (address: string) => json<{ message: string }>(`/auth/wallet/nonce?address=${encodeURIComponent(address)}`),
  walletSignIn: (address: string, signature: string) =>
    json<AuthResponse>("/auth/wallet", send("POST", { address, signature })),
  linkWallet: (address: string, signature: string) =>
    json<{ user: PublicUser }>("/auth/wallet/link", send("POST", { address, signature })),
  me: () => json<{ user: PublicUser }>("/auth/me"),

  records: (patientId?: string) =>
    json<{ records: PcosRecord[] }>(`/records${patientId ? `?patientId=${encodeURIComponent(patientId)}` : ""}`),
  record: (id: string) => json<{ record: PcosRecord }>(`/records/${id}`),
  createRecord: (input: RecordInput) => json<{ record: PcosRecord }>("/records", send("POST", input)),
  updateRecord: (id: string, input: Omit<RecordInput, "patientId">) =>
    json<{ record: PcosRecord }>(`/records/${id}`, send("PUT", input)),
  deleteRecord: (id: string) => json<void>(`/records/${id}`, send("DELETE")),

  grants: () => json<{ grants: GrantView[] }>("/grants"),
  grant: (doctorId: string) => json<{ grant: GrantView }>("/grants", send("POST", { doctorId })),
  revoke: (grantId: string) => json<{ grant: GrantView }>(`/grants/${grantId}`, send("DELETE")),
  setResearchConsent: (consent: boolean) =>
    json<{ user: PublicUser }>("/me/research-consent", send("PUT", { consent })),
  doctors: () => json<{ doctors: UserSummary[] }>("/doctors"),
  patients: () => json<{ patients: UserSummary[] }>("/patients"),
  researchDataset: () => json<{ consentingPatients: number; records: DeidentifiedRecord[] }>("/research/dataset"),

  ledger: () => json<{ blocks: Block[]; height: number; headHash: string }>("/ledger"),
  verifyLedger: () => json<LedgerVerification>("/ledger/verify"),
};
