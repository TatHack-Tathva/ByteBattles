import { useState } from "react";
import { ghost } from "../ui";
import { deleteProblem, type ProblemSummary } from "../../services/problems";

export default function ProblemTable({ problems, onChanged }: { problems: ProblemSummary[]; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const remove = async (id: string) => {
    if (!confirm(`Delete ${id} and all its submissions? This cannot be undone.`)) return;
    try {
      await deleteProblem(id);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };
  return (
    <div className="space-y-2">
      {error && <p className="text-rose-400">{error}</p>}
      <div className="divide-y divide-slate-800 rounded-lg border border-slate-800">
        {problems.map((p) => (
          <div key={p.id} className="flex items-center gap-4 px-4 py-3">
            <span className="w-16 font-mono text-sm text-slate-400">{p.id}</span>
            <span className="flex-1">{p.title}</span>
            <span className="text-sm text-slate-400">{p.total_submissions} submissions</span>
            <button className={ghost} onClick={() => remove(p.id)}>Delete</button>
          </div>
        ))}
        {problems.length === 0 && <p className="p-4 text-slate-400">No problems yet.</p>}
      </div>
    </div>
  );
}
