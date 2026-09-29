import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SubmissionPanel from "../components/SubmissionPanel";
import type { Submission } from "../services/submissions";

const base: Submission = { id: 7, language: "PY", submitted_at: "", problem_id: "P", username: "u", verdict: "PD",
  output: null, incorrect_testcase: null, walltime_ms: null, memory_kb: null };

describe("SubmissionPanel", () => {
  it("shows the idle hint and the sending state", () => {
    const { rerender } = render(<SubmissionPanel result={null} error={null} busy={false} />);
    expect(screen.getByText(/Ctrl\+Enter/)).toBeInTheDocument();
    rerender(<SubmissionPanel result={null} error={null} busy />);
    expect(screen.getByText("Sending to the judge")).toBeInTheDocument();
  });

  it("spins while pending", () => {
    render(<SubmissionPanel result={base} error={null} busy />);
    expect(screen.getByText("Judging")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "judging" })).toBeInTheDocument();
  });

  it("celebrates AC with time and memory, no logs", () => {
    render(<SubmissionPanel result={{ ...base, verdict: "AC", walltime_ms: 12, memory_kb: 2048 }} error={null} busy={false} />);
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getByText(/12 ms/)).toBeInTheDocument();
    expect(screen.getByText(/2\.0 MB/)).toBeInTheDocument();
    expect(screen.queryByText("Your output")).toBeNull();
  });

  it("shows failing input beside the output on WA", () => {
    render(<SubmissionPanel result={{ ...base, verdict: "WA", incorrect_testcase: "1 2", output: "-1" }} error={null} busy={false} />);
    expect(screen.getByText("Failing testcase input")).toBeInTheDocument();
    expect(screen.getByText("Your output")).toBeInTheDocument();
    expect(screen.getByText("1 2")).toBeInTheDocument();
  });

  it("labels the log as an error log for CE/RE and shows API errors", () => {
    render(<SubmissionPanel result={{ ...base, verdict: "CE", output: "syntax error" }} error="Connection issue" busy={false} />);
    expect(screen.getByText("Error log")).toBeInTheDocument();
    expect(screen.getByText("Connection issue")).toBeInTheDocument();
  });
});
