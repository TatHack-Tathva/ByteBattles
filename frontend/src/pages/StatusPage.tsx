import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import { getHealth, type Health } from "../services/health";

const POLL_MS = 3000;
type Level = "ok" | "warn" | "down";

const DOT: Record<Level, string> = { ok: "bg-emerald-400", warn: "bg-amber-400", down: "bg-rose-500" };
const WORD: Record<Level, string> = { ok: "All systems nominal", warn: "Degraded", down: "Outage" };

// Internal telemetry panel: polls GET /health and measures the round trip as "API ping".
export default function StatusPage() {
  const [h, setH] = useState<Health | null>(null);
  const [ping, setPing] = useState<number | null>(null);
  const [unreachable, setUnreachable] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const t0 = performance.now();
      try {
        const data = await getHealth();
        if (!alive) return;
        setH(data);
        const ms = Math.round(performance.now() - t0);
        setPing(ms);
        setHistory((h) => [...h.slice(-19), ms]);
        setUnreachable(null);
        setUpdated(new Date());
      } catch (e) {
        if (alive) setUnreachable(e instanceof Error ? e.message : "API unreachable");
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  let level: Level = "ok";
  if (unreachable || !h || h.redis !== "up" || h.postgres === "down") level = "down";
  else if ((h.active_judge_workers ?? 0) === 0 || (h.judge_queue_depth ?? 0) > 50) level = "warn";
  if (!h && !unreachable) level = "warn"; // first load

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl animate-fade-up space-y-6 p-4 sm:p-6">
        <header className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${DOT[level]}`} />
          <h1 className="text-xl font-bold">{!h && !unreachable ? "Connecting" : WORD[level]}</h1>
        </header>
        {unreachable && <p className="rounded border border-rose-500/50 p-3 text-sm text-rose-400">{unreachable}</p>}
        {level === "warn" && h && (h.active_judge_workers ?? 0) === 0 && (
          <p className="text-sm text-amber-400">No judge workers are reporting a heartbeat. Submissions will stay pending.</p>
        )}
        {h && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Stat label="Queue backlog" value={h.judge_queue_depth} />
              <Stat label="Active workers" value={h.active_judge_workers} />
              <Stat label="API ping" value={ping != null ? `${ping} ms` : null} />
              <Stat label="Redis latency" value={h.redis_latency_ms != null ? `${h.redis_latency_ms} ms` : null} />
              <Stat label="Redis" value={h.redis} />
              <Stat label="Postgres" value={h.postgres} />
            </div>
            {history.length > 1 && (
              <section>
                <h2 className="mb-2 text-sm text-slate-400">API ping, last {history.length} samples</h2>
                <div className="flex h-12 items-end gap-1" aria-hidden>
                  {history.map((v, i) => (
                    <span key={i} className="flex-1 animate-pop rounded-t bg-amber-400/70" style={{ height: `${Math.max(8, (v / Math.max(...history)) * 100)}%` }} title={`${v} ms`} />
                  ))}
                </div>
              </section>
            )}
            {h.warm_sandboxes && (
              <section>
                <h2 className="mb-2 text-sm text-slate-400">Warm sandbox pool</h2>
                <div className="grid grid-cols-4 gap-3">
                  {Object.entries(h.warm_sandboxes).map(([lang, n]) => <Stat key={lang} label={lang} value={n} />)}
                </div>
              </section>
            )}
            {updated && <p className="text-xs text-slate-500">Updated {updated.toLocaleTimeString()}, refreshing every {POLL_MS / 1000}s</p>}
          </>
        )}
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
      <div className="text-xs uppercase text-slate-400">{label}</div>
      <div className="text-xl font-bold">{value ?? "n/a"}</div>
    </div>
  );
}
