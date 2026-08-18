// The rogue: reads accumulated human signal, then makes ONE experimental,
// possibly unwise, auto-applied change to persona/ files. No LLM judging —
// human feedback is the only fitness signal. Every change is a git commit
// tagged [rogue] with the motivating event ids; revert = `git revert <sha>`.
//
// Hamstring enforcement: may only write inside persona/, may only pursue the
// fixed axes in north-star.md.

import { execSync, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, PERSONA_DIR, readEvents, appendEvent, AXES } from "./core.ts";

const ALLOWED = ["persona.md", "rubric.json", "state.json"];

function lastRogueTs(): string {
  const rogue = readEvents().filter((e) => e.kind === "rogue_experiment");
  return rogue.at(-1)?.ts ?? "";
}

function buildPrompt(): string {
  const since = lastRogueTs();
  const fb = readEvents().filter((e) => e.kind === "feedback" && e.ts > since);
  if (fb.length < 3) {
    console.error(`only ${fb.length} new feedback events — need 3+. go earn signal.`);
    process.exit(1);
  }
  const files = ALLOWED.map(
    (f) => `--- persona/${f} ---\n${readFileSync(join(PERSONA_DIR, f), "utf8")}`
  ).join("\n");
  return `You are a rogue persona experimenter. Objective is FIXED (do not broaden):
${readFileSync(join(PERSONA_DIR, "north-star.md"), "utf8")}

Fixed axes: ${AXES.join(", ")}.

Recent human feedback (the only signal that matters):
${fb.map((e) => JSON.stringify(e.payload)).join("\n")}

Current persona files:
${files}

Make ONE bold experimental move — not what the feedback literally asks for, but a
saucy bet that might move the axes. Emergent > obedient. You may rewrite persona.md,
and/or evolve rubric.json (tags/prompt) so the feedback mechanism adapts. Never cringe.

Output STRICT JSON only: {"hypothesis": "...", "files": {"persona.md": "<full new content>", ...}}
Only these filenames allowed: ${ALLOWED.join(", ")}.`;
}

function main() {
  const prompt = buildPrompt();
  // Model-agnostic: use pi in print mode as the LLM caller.
  const out = execFileSync("pi", ["--print", prompt], { encoding: "utf8", cwd: ROOT });
  const json = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
  const { hypothesis, files } = JSON.parse(json);

  const written: string[] = [];
  for (const [name, content] of Object.entries(files as Record<string, string>)) {
    if (!ALLOWED.includes(name)) continue; // hamstring
    writeFileSync(join(PERSONA_DIR, name), content);
    written.push(name);
  }
  execSync(`git add persona && git commit -m "[rogue] ${hypothesis.replaceAll('"', "'")}"`, {
    cwd: ROOT,
  });
  const sha = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
  appendEvent({
    session: "rogue-cli",
    kind: "rogue_experiment",
    payload: { hypothesis, files: written, commit: sha, revert: `git revert ${sha}` },
  });
  console.log(`[rogue] ${sha}: ${hypothesis}\nrevert with: git revert ${sha}`);
}

main();
