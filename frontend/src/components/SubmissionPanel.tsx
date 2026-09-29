import { useEffect, useState } from "react";
import type { Submission, Verdict } from "../services/submissions";

const VERDICTS: Record<Verdict, [string, string]> = {
  PD: ["Judging", "text-amber-400"],
  AC: ["Accepted", "text-emerald-400"],
  WA: ["Wrong answer", "text-rose-400"],
  TLE: ["Time limit exceeded", "text-orange-400"],
  MLE: ["Memory limit exceeded", "text-orange-400"],
  CE: ["Compilation error", "text-rose-400"],
  RE: ["Runtime error", "text-rose-400"],
  SKP: ["Skipped", "text-slate-400"],
};

export const Spinner = () => (
  <span role="status" aria-label="judging" className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
);

function Log({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-w-0">
      <h4 className="mb-1 text-xs uppercase text-slate-400">{title}</h4>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-slate-800 bg-slate-950 p-3 font-mono text-xs">{body || "(empty)"}</pre>
    </div>
  );
}

function Elapsed() {
  const [s, setS] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setS((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular-nums text-slate-400">{s}s</span>;
}

export default function SubmissionPanel({ result, error, busy }: { result: Submission | null; error: string | null; busy: boolean }) {
  if (error && !result) return <div role="alert" className="animate-fade-up rounded-lg border border-rose-500/50 p-4 text-sm text-rose-400">{error}</div>;
  if (!result)
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-800 p-4 text-sm text-slate-400">
        {busy ? <><Spinner /> Sending to the judge</> : "Submit to see the verdict here. Tip: Ctrl+Enter submits."}
      </div>
    );

  const [label, color] = VERDICTS[result.verdict];
  const pending = result.verdict === "PD";
  const accepted = result.verdict === "AC";
  const failed = !pending && !accepted;
  // The API returns the failing testcase's input and the program's output/error log, but not the
  // expected output, so a true expected-vs-actual diff isn't possible; show both blocks side by side.
  const isErrorLog = result.verdict === "CE" || result.verdict === "RE";

  return (
    <div
      key={result.verdict} // remount on verdict change so the entrance animation replays
      className={`relative animate-pop overflow-hidden rounded-lg border bg-slate-900 p-4 text-sm ${
        accepted ? "animate-glow border-emerald-500/60" : failed ? "border-rose-500/30" : "border-slate-800"
      }`}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-3">
        {pending && <Spinner />}
        {accepted && (
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
            <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <span className={`text-xl font-bold ${color}`}>{label}</span>
        <span className="text-slate-400">
          Submission {result.id}
          {result.walltime_ms != null && `, ${result.walltime_ms} ms`}
          {result.memory_kb != null && `, ${(result.memory_kb / 1024).toFixed(1)} MB`}
        </span>
        {pending && <Elapsed />}
      </div>
      {pending && (
        <div className="mt-3 h-1 overflow-hidden rounded bg-slate-800">
          <div className="h-full w-1/3 animate-slide rounded bg-amber-400" />
        </div>
      )}
      {failed && (result.incorrect_testcase != null || result.output) && (
        <div className={`mt-3 grid gap-3 ${result.incorrect_testcase != null && !isErrorLog ? "md:grid-cols-2" : ""}`}>
          {result.incorrect_testcase != null && <Log title="Failing testcase input" body={result.incorrect_testcase} />}
          {result.output != null && <Log title={isErrorLog ? "Error log" : "Your output"} body={result.output} />}
        </div>
      )}
      {error && <p className="mt-2 text-amber-400">{error}</p>}
    </div>
  );
}
