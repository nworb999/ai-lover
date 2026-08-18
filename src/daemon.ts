// The daemon. Owns the whole improvement loop — rogue.ts absorbed and retired.
// Long-running: watches events.jsonl, and on every 3 new feedback events it
//   1. SCORES its open bets: per-sha rating avg + bad-tag counts from YOUR feedback
//      (the only judge). Bad bets get `git revert`, by the daemon, with a logged reason.
//   2. BETS again: one bold persona/rubric mutation via `pi --print`, committed [daemon].
// Memory: persona/hypotheses.jsonl — every bet, prediction, and verdict.
// Hamstring: writes only persona.md / rubric.json / state.json, fixed axes only.
// Turn-boundary honesty: the live extension stamps events with the sha at turn_start,
// so a mid-turn commit here never mislabels signal.
//
// Run: node --experimental-strip-types src/daemon.ts

import { execSync, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync, existsSync, watchFile } from "node:fs";
import { join } from "node:path";
import { ROOT, PERSONA_DIR, EVENTS, AXES, readEvents, appendEvent, type LoverEvent } from "./core.ts";

const ALLOWED = ["persona.md", "rubric.json", "state.json"];
const LEDGER = join(PERSONA_DIR, "hypotheses.jsonl");
const WAKE_EVERY = 3; // new feedback events per wake
const MIN_SAMPLES = 3; // ratings needed to judge a bet

interface Bet {
  ts: string;
  commit: string;
  hypothesis: string;
  predicted: string; // which axes it claims to move
  verdict?: { call: "keep" | "revert"; avg: number; baseline: number; n: number; reason: string };
}

const readLedger = (): Bet[] =>
  existsSync(LEDGER) ? readFileSync(LEDGER, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
const writeLedger = (bets: Bet[]) =>
  writeFileSync(LEDGER, bets.map((b) => JSON.stringify(b)).join("\n") + "\n");

const git = (cmd: string) => execSync(`git ${cmd}`, { cwd: ROOT, maxBuffer: 1e7 }).toString().trim();
const fbOf = (evs: LoverEvent[], sha: string) =>
  evs.filter((e) => e.kind === "feedback" && e.personaSha === sha && (e.payload as any).rating);
const avg = (fb: LoverEvent[]) => fb.reduce((s, e) => s + ((e.payload as any).rating ?? 0), 0) / fb.length;

function scoreOpenBets(evs: LoverEvent[]) {
  const ledger = readLedger();
  for (const bet of ledger.filter((b) => !b.verdict)) {
    const mine = fbOf(evs, bet.commit);
    if (mine.length < MIN_SAMPLES) continue;
    // baseline: rated feedback under all earlier shas
    const before = evs.filter(
      (e) => e.kind === "feedback" && (e.payload as any).rating && e.ts < bet.ts
    );
    const baseline = before.length ? avg(before) : 3;
    const a = avg(mine);
    const call = a >= baseline ? "keep" : "revert";
    bet.verdict = { call, avg: a, baseline, n: mine.length, reason: `avg ${a.toFixed(2)} vs baseline ${baseline.toFixed(2)}` };
    if (call === "revert") {
      try {
        git(`revert --no-edit ${bet.commit}`);
      } catch {
        git("revert --abort");
        bet.verdict.reason += " (revert conflicted; left in place)";
      }
    }
    appendEvent({ session: "daemon", kind: "daemon_verdict", payload: { ...bet } });
    console.log(`[daemon] verdict on ${bet.commit}: ${call} — ${bet.verdict.reason}`);
  }
  writeLedger(ledger);
}

function placeBet(evs: LoverEvent[]) {
  const ledger = readLedger();
  const lastBetTs = ledger.at(-1)?.ts ?? "";
  const fresh = evs.filter((e) => e.kind === "feedback" && e.ts > lastBetTs);
  if (fresh.length < WAKE_EVERY) return;

  const files = ALLOWED.map((f) => `--- persona/${f} ---\n${readFileSync(join(PERSONA_DIR, f), "utf8")}`).join("\n");
  const prompt = `You are the daemon architecting a coding agent's personality. Objective is FIXED:
${readFileSync(join(PERSONA_DIR, "north-star.md"), "utf8")}
Fixed axes: ${AXES.join(", ")}. Human feedback is the only judge — no self-grading.

Your past bets and verdicts (learn from them; double down on what worked, swerve from what didn't):
${ledger.map((b) => JSON.stringify(b)).join("\n") || "(none yet)"}

Fresh human feedback since your last bet:
${fresh.map((e) => JSON.stringify(e.payload)).join("\n")}

Current persona files:
${files}

Make ONE bold experimental move — not what the feedback literally asks for, a bet that
might move the axes. Emergent > obedient. You may rewrite persona.md and/or evolve
rubric.json (tags/prompt) so the feedback mechanism itself adapts. Never cringe.
Output STRICT JSON only:
{"hypothesis":"...","predicted":"axes you expect to move","files":{"persona.md":"<full new content>"}}
Only these filenames: ${ALLOWED.join(", ")}.`;

  const out = execFileSync("pi", ["--print", prompt], { encoding: "utf8", cwd: ROOT });
  const { hypothesis, predicted, files: newFiles } = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
  for (const [name, content] of Object.entries(newFiles as Record<string, string>)) {
    if (ALLOWED.includes(name)) writeFileSync(join(PERSONA_DIR, name), content);
  }
  // Commit files + ledger together, THEN record the final sha (amending after
  // writing the ledger changed the sha out from under the bet: b2f224a bug).
  const bet: Bet = { ts: new Date().toISOString(), commit: "pending", hypothesis, predicted };
  appendFileSync(LEDGER, JSON.stringify(bet) + "\n");
  git(`add persona && git commit -m "[daemon] ${String(hypothesis).replaceAll('"', "'")}"`);
  bet.commit = git("rev-parse --short HEAD");
  const ledger2 = readLedger();
  ledger2[ledger2.length - 1] = bet;
  writeLedger(ledger2); // sha correction stays uncommitted until the next bet; readers use the file
  appendEvent({ session: "daemon", kind: "daemon_bet", payload: { ...bet } });
  console.log(`[daemon] bet ${bet.commit}: ${hypothesis}`);
}

// Single instance: pidfile lock. Ten daemons betting on the same signal is not
// emergence, it's a fork bomb with a personality.
const PIDFILE = "/tmp/ai-lover-daemon.pid";
try {
  const pid = Number(readFileSync(PIDFILE, "utf8"));
  if (pid && !Number.isNaN(pid)) {
    process.kill(pid, 0); // throws if not running
    console.log(`[daemon] already running as pid ${pid}, exiting`);
    process.exit(0);
  }
} catch {
  /* stale or missing pidfile: we take over */
}
writeFileSync(PIDFILE, String(process.pid));

let busy = false;
function wake() {
  if (busy) return;
  busy = true;
  try {
    const evs = readEvents();
    scoreOpenBets(evs);
    placeBet(evs);
  } catch (err) {
    console.error("[daemon] wake failed:", err);
  } finally {
    busy = false;
  }
}

console.log("[daemon] alive · watching events.jsonl");
wake();
watchFile(EVENTS, { interval: 2000 }, wake);
