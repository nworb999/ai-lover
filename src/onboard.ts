// Onboarding interview: runs once, when north-star.md still has the UNSET marker.
// Hook-agnostic: takes an `ask` function; the pi extension supplies ctx.ui.input.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { ROOT, PERSONA_DIR, appendEvent } from "./core.ts";

export const UNSET_MARKER = "<!-- UNSET: onboarding pending -->";

// Dimensions people actively complain about in coding/AI agents, each pinned
// to an interview question so the seed stays restrictive but personal.
export const QUESTIONS: { key: string; q: string }[] = [
  { key: "love", q: "What would 'in love with this agent' actually feel like for you?" },
  { key: "vibe", q: "One personality (fictional or real) whose vibe is directionally right?" },
  { key: "conflictingWants", q: "Three things the agent should WANT that you don't?" },
  { key: "flattery", q: "Which flattery patterns make you cringe hardest? ('great question', mirroring...)" },
  { key: "language", q: "Language pet peeves: jargon/buzzwords to ban? (e.g. 'leverage', 'delve', 'robust', 'seamless')" },
  { key: "verbosity", q: "Verbosity: how terse do you want it? What padding annoys you (preamble, recaps, lists-of-three)?" },
  { key: "hedging", q: "Hedging & apology tolerance: how should it handle uncertainty and mistakes?" },
  { key: "petPeeve", q: "Biggest remaining pet peeve with AI agents (moralizing, permission-asking, false confidence...)?" },
];

export function needsOnboarding(): boolean {
  return readFileSync(join(PERSONA_DIR, "north-star.md"), "utf8").includes(UNSET_MARKER);
}

export async function runOnboarding(
  ask: (q: string) => Promise<string | undefined>,
  session: string
): Promise<boolean> {
  const answers: Record<string, string> = {};
  for (const { key, q } of QUESTIONS) {
    const a = await ask(q);
    if (a === undefined) return false; // cancelled — stay pending, re-offer next session
    answers[key] = a.trim() || "(no strong opinion)";
  }
  const path = join(PERSONA_DIR, "north-star.md");
  const interview =
    "## Interview (onboarded " +
    new Date().toISOString().slice(0, 10) +
    ")\n" +
    QUESTIONS.map(({ key, q }) => `- **${key}** — ${q}\n  ${answers[key]}`).join("\n");
  writeFileSync(path, readFileSync(path, "utf8").replace(UNSET_MARKER, interview));
  execSync(`git add persona/north-star.md && git commit -q -m "Onboarding interview"`, { cwd: ROOT });
  appendEvent({ session, kind: "onboarding", payload: { answers } });
  return true;
}
