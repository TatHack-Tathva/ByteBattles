import { useCallback, useEffect, useRef, useState } from "react";
import { getSubmission, submit, type Language, type Submission } from "../services/submissions";

const POLL_MS = 1500;
const MAX_POLLS = 60;

// Dispatches a submission, then polls GET /submissions/{id} until the verdict is final.
export function useSubmission(onFinal?: () => void) {
  const [result, setResult] = useState<Submission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const runId = useRef(0); // a newer run/show cancels older polling loops
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const poll = async (first: Submission, me: number) => {
    let s = first;
    setResult(s);
    for (let i = 0; i < MAX_POLLS && s.verdict === "PD" && alive.current && runId.current === me; i++) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (!alive.current || runId.current !== me) return;
      try {
        s = await getSubmission(s.id);
        setResult(s);
        setError(null);
      } catch (e) {
        setError(`Connection issue, retrying. ${e instanceof Error ? e.message : ""}`); // keep polling through blips
      }
    }
    if (runId.current !== me || !alive.current) return;
    if (s.verdict === "PD") setError("Still pending. The judge may be offline, check the Status page.");
    else {
      setError(null);
      onFinalRef.current?.();
    }
  };

  const run = useCallback(async (problemId: string, language: Language, code: string) => {
    const me = ++runId.current;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      await poll(await submit(problemId, language, code), me);
    } catch (e) {
      if (alive.current && runId.current === me) setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      if (alive.current && runId.current === me) setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load an earlier submission (from the history list) into the panel.
  const show = useCallback(async (id: number) => {
    const me = ++runId.current;
    setBusy(false);
    setError(null);
    try {
      await poll(await getSubmission(id), me);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "Could not load submission");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { run, show, result, error, busy };
}
