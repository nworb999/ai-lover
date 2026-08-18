// ai-lover dashboard. Zero deps: node:http + one inline page.
// Run: node --experimental-strip-types src/dash.ts  → http://localhost:4666
import { createServer } from "node:http";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, readEvents } from "./core.ts";

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
  try {
    return execSync(`git show ${sha} -- persona/`, { cwd: ROOT, maxBuffer: 1e7 }).toString();
  } catch {
    return "no diff";
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/api/data") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ events: readEvents(), versions: personaLog() }));
  } else if (url.pathname === "/api/diff") {
    res.setHeader("content-type", "text/plain");
    res.end(personaDiff(url.searchParams.get("sha") ?? "HEAD"));
  } else {
    res.setHeader("content-type", "text/html");
    res.end(readFileSync(join(ROOT, "src", "dash.html")));
  }
});
server.listen(PORT, () => console.log(`❦ http://localhost:${PORT}`));
