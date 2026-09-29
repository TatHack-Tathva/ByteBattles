import type { SubmissionHeader, Verdict } from "../services/submissions";
import { card } from "./ui";

const CHIP: Record<Verdict, string> = {
  PD: "text-amber-400", AC: "text-emerald-400", WA: "text-rose-400", TLE: "text-orange-400",
  MLE: "text-orange-400", CE: "text-rose-400", RE: "text-rose-400", SKP: "text-slate-400",
};

export default function SubmissionHistory({ items, onSelect }: { items: SubmissionHeader[]; onSelect: (id: number) => void }) {
  if (items.length === 0) return null;
  return (
    <section className={`${card} animate-fade-up p-3`}>
      <h3 className="mb-2 text-xs uppercase text-slate-400">Your recent submissions</h3>
      <ul className="divide-y divide-slate-800 text-sm">
        {items.map((s) => (
          <li key={s.id}>
            <button onClick={() => onSelect(s.id)} className="flex w-full items-center gap-3 px-1 py-1.5 text-left transition hover:bg-slate-800/60">
              <span className={`w-10 font-bold ${CHIP[s.verdict]}`}>{s.verdict}</span>
              <span className="flex-1 text-slate-400">{new Date(/(Z|[+-]\d\d:\d\d)$/i.test(s.submitted_at) ? s.submitted_at : s.submitted_at + "Z").toLocaleString()}</span>
              <span className="text-slate-500">{s.walltime_ms != null ? `${s.walltime_ms} ms` : ""}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
