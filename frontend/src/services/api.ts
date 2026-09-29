// Thin fetch wrapper: base URL, bearer token, one automatic token refresh, readable errors.
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const KEY = "bb_tokens";
export const LOGOUT_EVENT = "bb:logout";

export interface Tokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export const tokenStore = {
  get(): Tokens | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Tokens) : null;
    } catch {
      return null; // corrupted storage should behave like "logged out"
    }
  },
  set(t: Tokens) {
    localStorage.setItem(KEY, JSON.stringify(t));
  },
  clear() {
    localStorage.removeItem(KEY);
  },
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// FastAPI returns `detail` as a string, or a list of {msg} objects for validation errors.
function detailOf(body: unknown, status: number): string {
  const d = (body as { detail?: unknown })?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d.length) return d.map((x) => (x as { msg?: string }).msg ?? "Invalid input").join("; ");
  return `Request failed (${status})`;
}

let refreshing: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const t = tokenStore.get();
  if (!t?.refresh_token) return false;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: t.refresh_token }),
    });
    if (!res.ok) return false;
    const { access_token } = (await res.json()) as { access_token: string };
    tokenStore.set({ ...t, access_token });
    return true;
  } catch {
    return false;
  }
}

// `failedToken` is the access token the rejected request used. If the stored token has since changed,
// another request already refreshed it, so just retry. Concurrent 401s share one in-flight refresh.
function refreshAccessToken(failedToken: string | undefined): Promise<boolean> {
  const current = tokenStore.get();
  if (!current) return Promise.resolve(false);
  if (current.access_token !== failedToken) return Promise.resolve(true);
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function send(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  const tokens = tokenStore.get();
  if (tokens) headers.set("Authorization", `Bearer ${tokens.access_token}`);
  try {
    return await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    // fetch only throws on network failure, which is what a CORS block looks like too
    throw new ApiError(0, `Cannot reach ${BASE}. Is the backend running, and is this origin listed in CORS_ORIGINS?`);
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const usedToken = tokenStore.get()?.access_token;
  let res = await send(path, init);
  if (res.status === 401 && usedToken && !path.startsWith("/auth/")) {
    if (await refreshAccessToken(usedToken)) res = await send(path, init);
    if (res.status === 401) {
      tokenStore.clear();
      window.dispatchEvent(new Event(LOGOUT_EVENT)); // AuthProvider sends the user back to /login
    }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, detailOf(body, res.status));
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}
