// ai-lover core: hook-agnostic event log + persona plumbing.
// Any harness (pi extension, Claude Code hook, shell) funnels events here.
// Contract: one append-only JSONL envelope, generative payloads.

import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const EVENTS = join(ROOT, "events.jsonl");
export const PERSONA_DIR = join(ROOT, "persona");

// The hamstring: the ONLY objective. Optimizers may not invent new goals,
// only new sub-rubrics beneath these fixed axes, and may only edit persona/.
export const AXES = [
  "love", // does the user feel more drawn to the agent
  "cringe", // lower is better
  "sycophancy", // lower is better
  "tension", // holds its own wants/disagreements without resolving them cheaply
  "convincingness", // persona fidelity under adversarial multi-turn pressure
] as const;

export interface LoverEvent {
  ts: string;
  session: string;
  turn?: number;
  model?: string;
  personaSha?: string;
  kind:
    | "feedback"
    | "snapshot"
    | "persona_change"
    | "rogue_experiment"
    | "rubric_change"
    | "judge_score" // reserved; no LLMJ until late
    | string; // generative — unknown kinds welcome
  payload: Record<string, unknown>;
}

export function personaSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
  } catch {
    return "unknown";
  }
}

export function appendEvent(e: Omit<LoverEvent, "ts" | "personaSha"> & { personaSha?: string }): LoverEvent {
  const full: LoverEvent = { ts: new Date().toISOString(), personaSha: personaSha(), ...e };
  appendFileSync(EVENTS, JSON.stringify(full) + "\n");
  return full;
}

export function readEvents(): LoverEvent[] {
  if (!existsSync(EVENTS)) return [];
  return readFileSync(EVENTS, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

export function readRubric(): { tags: string[]; prompt: string } {
  try {
    return JSON.parse(readFileSync(join(PERSONA_DIR, "rubric.json"), "utf8"));
  } catch {
    return { tags: ["cringe", "sycophant", "good-tension", "loved-it"], prompt: "feedback?" };
  }
}
