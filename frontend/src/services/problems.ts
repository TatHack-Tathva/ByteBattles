import { request } from "./api";

export type Difficulty = "EASY" | "MEDIUM" | "HARD";
export interface ProblemSummary {
  id: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  accepted_submissions: number;
  total_submissions: number;
}
export interface ProblemList {
  items: ProblemSummary[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}
export interface ProblemDetail extends ProblemSummary {
  description: string;
  constraints: string[];
  input_desc: string;
  output_desc: string;
  sample_io: Record<string, string>;
  explanation: string | null;
  memory_limit_mb: number;
  time_limit_sec: number;
  visibility: boolean;
}
export interface Tag {
  name: string;
  slug: string;
}

export const listProblems = (page = 1, title = "") =>
  request<ProblemList>(`/problems/?page=${page}&limit=20${title ? `&title=${encodeURIComponent(title)}` : ""}`);
export const getProblem = (id: string) => request<ProblemDetail>(`/problems/${encodeURIComponent(id)}`);
export const listTags = () => request<Tag[]>("/problems/tags");
export const createTag = (tag: Tag) =>
  request<Tag>("/problems/tag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tag) });
// multipart: let the browser set the Content-Type boundary itself
export const createProblem = (form: FormData) =>
  request<{ id: string; testcases: number }>("/problems/", { method: "POST", body: form });
export const deleteProblem = (id: string) => request<void>(`/problems/?problem_id=${encodeURIComponent(id)}`, { method: "DELETE" });
