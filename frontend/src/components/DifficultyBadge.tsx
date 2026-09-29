import { DIFF_STYLE } from "./ui";

export default function DifficultyBadge({ level }: { level: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${DIFF_STYLE[level] ?? ""}`}>{level}</span>;
}
