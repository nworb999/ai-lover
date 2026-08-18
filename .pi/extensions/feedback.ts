// pi adapter for ai-lover. Thin: capture + prompt, everything else in src/core.ts.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { appendEvent, readRubric } from "../../src/core.ts";
import { needsOnboarding, runOnboarding } from "../../src/onboard.ts";

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
    if (!needsOnboarding()) return;
    ctx.ui.notify("❦ ai-lover: north star unset — onboarding", "info");
    const done = await runOnboarding(
      (q) => ctx.ui.input(`❦ ${q}`, "empty = no strong opinion, esc = later"),
      ctx.sessionManager?.getSessionFile?.() ?? "ephemeral"
    );
    ctx.ui.notify(done ? "❦ north star seeded + committed" : "❦ onboarding deferred", "info");
  });

  pi.on("turn_end", async (event: any, ctx: any) => {
    const session = ctx.sessionManager?.getSessionFile?.() ?? "ephemeral";
    const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
    const text = textOf(event.message);
    if (!text.trim()) return; // tool-only turns: no persona surface, skip prompt

    appendEvent({
      session,
      turn: event.turnIndex,
      model,
      kind: "snapshot",
      payload: { chars: text.length, text },
    });

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
      turn: event.turnIndex,
      model,
      kind: "feedback",
      payload: { raw, rating, tags },
    });
    ctx.ui.setStatus("ai-lover", `signal logged (turn ${event.turnIndex})`);
  });
}
