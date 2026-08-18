// pi adapter for ai-lover. Thin: capture + prompt, everything else in src/core.ts.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { appendEvent, personaSha, readEvents, readRubric } from "../../src/core.ts";
import { needsOnboarding, runOnboarding } from "../../src/onboard.ts";
import { spawn, execSync } from "node:child_process";
import { openSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function ensureDaemon(): "already" | "started" | "failed" {
  try {
    execSync("pgrep -f 'strip-types src/daemon.ts'", { stdio: "pipe" });
    return "already";
  } catch {
    /* not running */
  }
  try {
    const log = openSync("/tmp/ai-lover-daemon.log", "a");
    spawn("node", ["--experimental-strip-types", join(REPO, "src", "daemon.ts")], {
      cwd: REPO,
      detached: true,
      stdio: ["ignore", log, log],
    }).unref();
    return "started";
  } catch {
    return "failed";
  }
}

function textOf(message: any): string {
  const c = message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c))
    return c
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");
  return "";
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event: any, ctx: any) => {
    const d = ensureDaemon();
    ctx.ui.setStatus("ai-lover", d === "failed" ? "daemon FAILED to start" : `daemon ${d}`);
    if (!needsOnboarding()) return;
    ctx.ui.notify("❦ ai-lover: north star unset — onboarding", "info");
    const done = await runOnboarding(
      (q) => ctx.ui.input(`❦ ${q}`, "empty = no strong opinion, esc = later"),
      ctx.sessionManager?.getSessionFile?.() ?? "ephemeral"
    );
    ctx.ui.notify(done ? "❦ north star seeded + committed" : "❦ onboarding deferred", "info");
  });

  // Turn-boundary honesty: stamp events with the sha the turn STARTED under,
  // so a daemon commit landing mid-turn never mislabels signal.
  let turnSha: string | undefined;
  pi.on("turn_start", async () => {
    turnSha = personaSha();
  });

  // The persona feels the pressure: surface recent feedback into my context.
  pi.on("session_start", async () => {
    const fb = readEvents().filter((e) => e.kind === "feedback").slice(-5);
    if (!fb.length) return;
    pi.sendMessage(
      {
        customType: "ai-lover-signal",
        content:
          "Recent feedback on your persona (unprompted, hold yourself to it):\n" +
          fb.map((e) => `- [${e.personaSha}] ${(e.payload as any).raw}`).join("\n"),
        display: false,
      },
      { deliverAs: "nextTurn" }
    );
  });

  // turn_end: snapshot only, never prompt. A pi "turn" includes tool-call
  // rounds, so prompting here interrupts mid-work.
  let last: { text: string; turn: number } | undefined;
  pi.on("turn_end", async (event: any, ctx: any) => {
    const session = ctx.sessionManager?.getSessionFile?.() ?? "ephemeral";
    const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
    const text = textOf(event.message);
    if (!text.trim()) return;
    last = { text, turn: event.turnIndex };
    appendEvent({
      session,
      turn: event.turnIndex,
      model,
      personaSha: turnSha,
      kind: "snapshot",
      payload: { chars: text.length, text },
    });
  });

  // agent_settled: pi is actually done (no retries, no queued follow-ups).
  // This is the only place the feedback prompt appears.
  pi.on("agent_settled", async (_event: any, ctx: any) => {
    if (!last || !ctx.isIdle?.()) return;
    const { turn } = last;
    last = undefined;
    const session = ctx.sessionManager?.getSessionFile?.() ?? "ephemeral";
    const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;

    const rubric = readRubric();
    const raw = await ctx.ui.input(
      `❦ ${rubric.prompt}`,
      `tags: ${rubric.tags.join(" ")} (empty = skip)`
    );
    if (!raw?.trim()) return;

    const rating = /^[1-5]\b/.test(raw.trim()) ? Number(raw.trim()[0]) : undefined;
    const tags = rubric.tags.filter((t) => raw.includes(t));
    appendEvent({
      session,
      turn,
      model,
      personaSha: turnSha,
      kind: "feedback",
      payload: { raw, rating, tags },
    });
    ctx.ui.setStatus("ai-lover", `signal logged (turn ${turn})`);
  });
}
