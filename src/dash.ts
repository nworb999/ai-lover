// ai-lover dashboard. Zero deps: node:http + one inline page.
// Run: node --experimental-strip-types src/dash.ts  → http://localhost:4666
import { createServer } from "node:http";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, PERSONA_DIR, readEvents } from "./core.ts";
import { existsSync } from "node:fs";

const PORT = 4666;

function personaLog() {
  const raw = execSync("git log --format='%h|%aI|%s' -- persona/", { cwd: ROOT }).toString();
  return raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [sha, ts, ...s] = l.split("|");
      return { sha, ts, subject: s.join("|"), rogue: s.join("|").startsWith("[rogue]") };
    });
}

function personaDiff(sha: string): string {
  if (!/^[0-9a-f]{4,40}$/i.test(sha)) return "bad sha";
  try {
    const out = execSync(`git show ${sha} -- persona/`, { cwd: ROOT, maxBuffer: 1e7 }).toString();
    return out.trim() || execSync(`git show ${sha}`, { cwd: ROOT, maxBuffer: 1e7 }).toString();
  } catch {
    return "no diff";
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/api/data") {
    res.setHeader("content-type", "application/json");
    const lp = join(PERSONA_DIR, "hypotheses.jsonl");
    const ledger = existsSync(lp)
      ? readFileSync(lp, "utf8").toString().split("\n").filter(Boolean).map((l) => JSON.parse(l))
      : [];
    let state = {};
    try {
      state = JSON.parse(readFileSync(join(PERSONA_DIR, "state.json"), "utf8"));
    } catch {}
    res.end(JSON.stringify({ events: readEvents(), versions: personaLog(), ledger, state }));
  } else if (url.pathname === "/api/diff") {
    res.setHeader("content-type", "text/plain");
    res.end(personaDiff(url.searchParams.get("sha") ?? "HEAD"));
  } else {
    res.setHeader("cache-control", "no-store");
    res.setHeader("content-type", "text/html");
    res.end(readFileSync(join(ROOT, "src", "dash.html")));
  }
});
server.listen(PORT, () => console.log(`❦ http://localhost:${PORT}`));
