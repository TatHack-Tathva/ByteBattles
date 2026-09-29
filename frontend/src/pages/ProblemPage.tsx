import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import CodeEditor from "../components/CodeEditor";
import DifficultyBadge from "../components/DifficultyBadge";
import Navbar from "../components/Navbar";
import Skeleton from "../components/Skeleton";
import SubmissionHistory from "../components/SubmissionHistory";
import SubmissionPanel from "../components/SubmissionPanel";
import { LANGUAGES, STARTERS } from "../components/languages";
import { button, ghost, input } from "../components/ui";
import { useSubmission } from "../hooks/useSubmission";
import { ApiError } from "../services/api";
import { getProblem, type ProblemDetail } from "../services/problems";
import { listMySubmissions, type Language, type SubmissionHeader } from "../services/submissions";

export default function ProblemPage() {
  const { id = "" } = useParams();
  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [loadError, setLoadError] = useState<ApiError | Error | null>(null);
  const [language, setLanguage] = useState<Language>("PY");
  const [code, setCode] = useState(STARTERS.PY);
  const [history, setHistory] = useState<SubmissionHeader[]>([]);
  const storageKey = `bb_code_${id}_${language}`;
  const loadedKey = useRef(""); // guards against saving a starter/old draft under the wrong key

  const refreshHistory = useCallback(() => void listMySubmissions(id).then(setHistory).catch(() => {}), [id]);
  const { run, show, result, error, busy } = useSubmission(refreshHistory);

  useEffect(() => {
    setProblem(null);
    setLoadError(null);
    getProblem(id).then(setProblem).catch(setLoadError);
    refreshHistory();
  }, [id, refreshHistory]);

  // Restore this problem's draft for the chosen language, or fall back to the starter
  useEffect(() => {
    setCode(localStorage.getItem(storageKey) ?? STARTERS[language]);
    loadedKey.current = storageKey;
  }, [storageKey, language]);

  const onChange = (v: string) => {
    setCode(v);
    if (loadedKey.current === storageKey) localStorage.setItem(storageKey, v);
  };

  const submitNow = useCallback(() => {
    if (!busy && problem && code.trim()) void run(id, language, code);
  }, [busy, problem, code, run, id, language]);

  // Ctrl/Cmd+Enter submits, even while the editor has focus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        submitNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submitNow]);

  const resetCode = () => {
    if (confirm("Reset to the starter code? Your draft for this language will be lost.")) onChange(STARTERS[language]);
  };

  const notFound = loadError instanceof ApiError && loadError.status === 404;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto grid max-w-7xl gap-8 p-4 sm:p-6 lg:grid-cols-2">
        <section className="min-w-0 space-y-4">
          <Link to="/" className="text-sm text-slate-400 hover:text-amber-400">&larr; All problems</Link>
          {loadError && (
            <p role="alert" className="text-rose-400">{notFound ? "This problem doesn't exist or is hidden." : loadError.message}</p>
          )}
          {!problem && !loadError && (
            <div className="space-y-3"><Skeleton className="h-9 w-2/3" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-32" /></div>
          )}
          {problem && (
            <div className="animate-fade-up space-y-4">
              <h1 className="text-3xl font-bold">{problem.title}</h1>
              <p className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
                <DifficultyBadge level={problem.difficulty} />
                <span>{problem.time_limit_sec}s</span><span>{problem.memory_limit_mb} MB</span>
                {problem.tags.map((t) => <span key={t} className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300">{t}</span>)}
              </p>
              <p className="whitespace-pre-wrap">{problem.description}</p>
              <h2 className="font-bold">Input</h2>
              <p className="whitespace-pre-wrap text-slate-400">{problem.input_desc}</p>
              <h2 className="font-bold">Output</h2>
              <p className="whitespace-pre-wrap text-slate-400">{problem.output_desc}</p>
              <h2 className="font-bold">Constraints</h2>
              <ul className="list-disc pl-5 text-slate-400">{problem.constraints.map((c) => <li key={c}>{c}</li>)}</ul>
              {Object.entries(problem.sample_io).map(([k, v]) => (
                <div key={k}>
                  <div className="mb-1 text-sm text-slate-400">Sample {k}</div>
                  <pre className="overflow-x-auto rounded border border-slate-800 bg-slate-900 p-3 font-mono text-sm">{v}</pre>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="lang" className="text-sm text-slate-400">Language</label>
            <select id="lang" className={`${input} w-auto`} value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
            <button className={ghost} onClick={resetCode} title="Restore starter code">Reset</button>
            <button className={`${button} ml-auto`} disabled={busy || !problem || !code.trim()} onClick={submitNow}>
              {busy ? "Judging..." : "Submit solution"}
            </button>
          </div>
          <div className="overflow-hidden rounded border border-slate-800">
            <CodeEditor language={language} value={code} onChange={onChange} />
          </div>
          <SubmissionPanel result={result} error={error} busy={busy} />
          <SubmissionHistory items={history} onSelect={(sid) => void show(sid)} />
        </section>
      </main>
    </div>
  );
}
