// Runs against a real backend (python -m tests.dev_server, or docker compose). Skipped if it isn't reachable.
import { describe, expect, it } from "vitest";
import { tokenStore } from "../services/api";
import * as auth from "../services/auth";
import { getProblem, listProblems } from "../services/problems";
import { getSubmission, listMySubmissions, submit } from "../services/submissions";
import { getHealth } from "../services/health";

const BASE = process.env.VITE_API_URL ?? "http://localhost:8000";
const up = await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false);
const wait = async (id: number) => {
  for (let i = 0; i < 40; i++) {
    const s = await getSubmission(id);
    if (s.verdict !== "PD") return s;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("still pending");
};

describe.skipIf(!up)("live backend through the frontend services", () => {
  it("allows the Vite origin via CORS and refuses others", async () => {
    const ok = await fetch(`${BASE}/health`, { method: "OPTIONS", headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "GET" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    const bad = await fetch(`${BASE}/health`, { method: "OPTIONS", headers: { Origin: "http://evil.example", "Access-Control-Request-Method": "GET" } });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("registers, logs in, sees user_type, judges WA then AC, and lists history", async () => {
    const u = `qa_${Date.now().toString(36)}`;
    await auth.register(u, `${u}@x.io`, "Orbit#2026", "Orbit#2026");
    await auth.login(u, "Orbit#2026");
    const me = await auth.fetchMe();
    expect(me).toMatchObject({ username: u, user_type: "USER" });
    expect((await getHealth()).redis).toBe("up");

    const problems = await listProblems(1);
    expect(problems.total).toBeGreaterThanOrEqual(3);
    const p = await getProblem("SUM01");
    expect(p.title).toBe("A + B");

    const wa = await wait((await submit("SUM01", "PY", "a, b = map(int, input().split())\nprint(a - b)")).id);
    expect(wa.verdict).toBe("WA");
    expect(wa.incorrect_testcase).toBe("1 2");
    const ac = await wait((await submit("SUM01", "PY", "a, b = map(int, input().split())\nprint(a + b)")).id);
    expect(ac.verdict).toBe("AC");
    const hist = await listMySubmissions("SUM01");
    expect(hist.map((h) => h.verdict)).toEqual(["AC", "WA"]);
  });

  it("recovers from an expired access token via the refresh token", async () => {
    await auth.login("alice", "Orbit#2026"); // storage is cleared between tests, so log in again
    const t = tokenStore.get()!;
    tokenStore.set({ ...t, access_token: "garbage" });
    expect((await auth.fetchMe()).username).toBe("alice");
    expect(tokenStore.get()!.access_token).not.toBe("garbage");
  });
});
