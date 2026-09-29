import { useCallback, useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import ProblemForm from "../components/admin/ProblemForm";
import ProblemTable from "../components/admin/ProblemTable";
import TagManager from "../components/admin/TagManager";
import BootstrapCard from "../components/admin/BootstrapCard";
import { useAuth } from "../hooks/useAuth";
import { listProblems, listTags, type ProblemSummary, type Tag } from "../services/problems";

const TABS = ["Create problem", "Manage problems", "Tags"] as const;

export default function AdminPage() {
  const { isAdmin, user } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Create problem");
  const [tags, setTags] = useState<Tag[]>([]);
  const [problems, setProblems] = useState<ProblemSummary[]>([]);

  const reloadTags = useCallback(() => void listTags().then(setTags).catch(() => {}), []);
  const reloadProblems = useCallback(() => void listProblems(1).then((d) => setProblems(d.items)).catch(() => {}), []);
  useEffect(() => {
    if (!isAdmin) return;
    reloadTags();
    reloadProblems();
  }, [isAdmin, reloadTags, reloadProblems]);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-5xl animate-fade-up space-y-6 p-4 sm:p-6">
        <h1 className="text-3xl font-bold">Admin console</h1>
                {!isAdmin ? (user ? <BootstrapCard /> : <p className="text-slate-400">Loading account...</p>) : (<>
        <div role="tablist" className="flex gap-2 border-b border-slate-800">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`px-4 py-2 ${tab === t ? "border-b-2 border-amber-400 font-bold" : "text-slate-400"}`}>{t}</button>
          ))}
        </div>
        {tab === "Create problem" && <ProblemForm tags={tags} onCreated={reloadProblems} />}
        {tab === "Manage problems" && <ProblemTable problems={problems} onChanged={reloadProblems} />}
        {tab === "Tags" && <TagManager tags={tags} onChanged={reloadTags} />}
        </>)}
      </main>
    </div>
  );
}
