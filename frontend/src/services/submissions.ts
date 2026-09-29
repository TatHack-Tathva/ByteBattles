import { request } from "./api";

export type Language = "PY" | "CPP" | "C" | "JS";
export type Verdict = "PD" | "AC" | "WA" | "TLE" | "MLE" | "CE" | "RE" | "SKP";

export interface Submission {
  id: number;
  language: Language;
  submitted_at: string;
  problem_id: string;
  username: string;
  verdict: Verdict;
  output: string | null;
  incorrect_testcase: string | null;
  walltime_ms: number | null;
  memory_kb: number | null;
  code?: string;
}
export type SubmissionHeader = Omit<Submission, "language" | "output" | "incorrect_testcase" | "code">;

export const submit = (problem_id: string, language: Language, code: string) =>
  request<Submission>("/submissions/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ problem_id, language, code }),
  });

export const getSubmission = (id: number) => request<Submission>(`/submissions/${id}`);
export const listMySubmissions = (problem_id: string, limit = 10) =>
  request<SubmissionHeader[]>(`/submissions/?problem_id=${encodeURIComponent(problem_id)}&limit=${limit}`);
