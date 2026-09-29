import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import DifficultyBadge from "../components/DifficultyBadge";
import Navbar from "../components/Navbar";
import Skeleton from "../components/Skeleton";
import { button, card, ghost, input } from "../components/ui";
import { listProblems, type ProblemList } from "../services/problems";

export default function DashboardPage() {
  const [data, setData] = useState<ProblemList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true; // ignore responses from stale searches
    setError(null);
    listProblems(page, query)
      .then((d) => live && setData(d))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [page, query]);

  const search = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setQuery(title.trim());
  };
  const clear = () => {
    setTitle("");
    setQuery("");
    setPage(1);
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
        <header className="animate-fade-up">
          <h1 className="text-3xl font-bold">Problems</h1>
          <p className="text-slate-400">Pick a challenge, write a solution, watch the judge respond.</p>
        </header>
        <form onSubmit={search} className="flex gap-3">
          <input className={input} placeholder="Search by title" aria-label="Search by title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className={button}>Search</button>
          {query && <button type="button" className={ghost} onClick={clear}>Clear</button>}
        </form>
        {error && (
          <div role="alert" className="flex items-center justify-between rounded border border-rose-500/50 p-3 text-sm text-rose-400">
            {error}
            <button className={ghost} onClick={() => setQuery(query + " ")}>Retry</button>
          </div>
        )}
        {!data && !error && (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        )}
        {data && (
          <>
            <ul className="space-y-2">
              {data.items.map((p, i) => {
                const rate = p.total_submissions ? Math.round((p.accepted_submissions / p.total_submissions) * 100) : 0;
                return (
                  <li key={p.id} className="animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                    <Link to={`/problems/${p.id}`} className={`${card} group flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 transition hover:-translate-y-0.5 hover:border-amber-400/60`}>
                      <span className="w-16 font-mono text-sm text-slate-500">{p.id}</span>
                      <span className="min-w-[10rem] flex-1 font-medium group-hover:text-amber-400">{p.title}</span>
                      <DifficultyBadge level={p.difficulty} />
                      <span className="hidden gap-1 sm:flex">
                        {p.tags.map((t) => <span key={t} className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300">{t}</span>)}
                      </span>
                      <span className="w-28 text-xs text-slate-400" title={`${p.accepted_submissions} of ${p.total_submissions} accepted`}>
                        <span className="block h-1.5 overflow-hidden rounded bg-slate-800">
                          <span className="block h-full rounded bg-emerald-400 transition-[width] duration-700" style={{ width: `${rate}%` }} />
                        </span>
                        <span className="mt-1 block">{p.total_submissions ? `${rate}% accepted` : "No attempts yet"}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {data.items.length === 0 && (
              <p className="animate-fade-up py-10 text-center text-slate-400">{query ? `No problems match "${query}".` : "No problems yet. An admin can add some."}</p>
            )}
            <div className="flex items-center justify-between text-sm text-slate-400">
              <span>Page {data.page}, {data.total} total</span>
              <span className="flex gap-2">
                {page > 1 && <button className={ghost} onClick={() => setPage(page - 1)}>Previous</button>}
                {data.has_more && <button className={ghost} onClick={() => setPage(page + 1)}>Next</button>}
              </span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
