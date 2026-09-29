import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOGOUT_EVENT, request, tokenStore } from "../services/api";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("api.request", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    tokenStore.set({ access_token: "old", refresh_token: "r", token_type: "bearer" });
  });

  it("refreshes the access token once on 401 and retries", async () => {
    const f = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(401, { detail: "expired" }))
      .mockResolvedValueOnce(json(200, { access_token: "new" }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    await expect(request("/users/me")).resolves.toEqual({ ok: true });
    expect(tokenStore.get()?.access_token).toBe("new");
    expect(tokenStore.get()?.refresh_token).toBe("r");
    expect(new Headers((f.mock.calls[2][1] as RequestInit).headers).get("Authorization")).toBe("Bearer new");
  });

  it("shares one refresh between concurrent 401s", async () => {
    let refreshCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.endsWith("/auth/refresh")) { refreshCalls++; return json(200, { access_token: "new" }); }
      const auth = new Headers((init as RequestInit).headers).get("Authorization");
      return auth === "Bearer new" ? json(200, { ok: true }) : json(401, { detail: "expired" });
    });
    await Promise.all([request("/a"), request("/b"), request("/c")]);
    expect(refreshCalls).toBe(1);
  });

  it("logs out when the refresh fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(401, { detail: "x" })).mockResolvedValueOnce(json(401, { detail: "bad refresh" }));
    const onLogout = vi.fn();
    window.addEventListener(LOGOUT_EVENT, onLogout);
    await expect(request("/users/me")).rejects.toMatchObject({ status: 401 });
    expect(tokenStore.get()).toBeNull();
    expect(onLogout).toHaveBeenCalled();
    window.removeEventListener(LOGOUT_EVENT, onLogout);
  });

  it("does not try to refresh on a failed login", async () => {
    tokenStore.clear();
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(401, { detail: "Invalid username or password" }));
    await expect(request("/auth/login", { method: "POST" })).rejects.toThrow("Invalid username or password");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("joins FastAPI validation errors and explains network failures", async () => {
    tokenStore.clear();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(422, { detail: [{ msg: "bad email" }, { msg: "short password" }] }));
    await expect(request("/auth/register")).rejects.toThrow("bad email; short password");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(request("/x")).rejects.toThrow(/CORS_ORIGINS/);
  });

  it("treats corrupted token storage as logged out", () => {
    localStorage.setItem("bb_tokens", "{not json");
    expect(tokenStore.get()).toBeNull();
  });
});
