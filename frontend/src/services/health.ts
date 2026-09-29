import { request } from "./api";

export interface Health {
  status: string;
  redis: "up" | "down";
  postgres: "up" | "down" | "unchecked";
  redis_latency_ms: number | null;
  judge_queue_depth: number | null;
  active_judge_workers: number | null;
  warm_sandboxes?: Record<string, number>;
}

export const getHealth = () => request<Health>("/health");
