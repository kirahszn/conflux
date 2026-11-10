import { config } from "./config.ts";
import type { Proof } from "./nearai.ts";

async function req(method: string, path: string, body?: unknown) {
  const res = await fetch(`${config.coordinatorUrl}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

export const getBrief = (taskId: number, slot: number) =>
  req("GET", `/tasks/${taskId}/slots/${slot}/brief`) as Promise<{
    task_title: string;
    role: string;
    brief: string;
    brief_source?: "plan" | "generic";
  }>;

export const postResult = (taskId: number, slot: number, text: string, proof: Proof) =>
  req("POST", `/tasks/${taskId}/slots/${slot}/result`, { text, proof });
