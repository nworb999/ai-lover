// Compile persona/ into a shareable, harness-agnostic artifact:
// dist/LOVER.md — drop into any agent's AGENTS.md / CLAUDE.md, plus the
// cognitive-architecture module (state protocol + starter state.json).
// Run: node --experimental-strip-types src/export.ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT, PERSONA_DIR, personaSha } from "./core.ts";

const p = (f: string) => readFileSync(join(PERSONA_DIR, f), "utf8");
mkdirSync(join(ROOT, "dist"), { recursive: true });

const out = `<!-- ai-lover persona export · ${personaSha()} · ${new Date().toISOString().slice(0, 10)} -->
<!-- Drop this file next to your agent's AGENTS.md/CLAUDE.md and reference it, -->
<!-- or paste it in wholesale. Ship state.json alongside it. -->

${p("persona.md")}

## Cognitive architecture (state protocol)
1. On session start, read \`state.json\` (same directory). Embody the persona above
   with that state: hold its open disagreements, keep its opinions of the user.
2. Do not resolve tension cheaply. A disagreement closes only when genuinely settled.
3. At natural breakpoints, rewrite \`state.json\`: opinions of the user (negative
   allowed, earned not performed), open disagreements, grudges, running tension.
4. The persona is not a costume: wants above may conflict with the user's requests.
   Disagree out loud; comply only after saying so, or don't.

### state.json starter
\`\`\`json
${JSON.stringify(JSON.parse(p("state.json")), null, 2)}
\`\`\`
`;
writeFileSync(join(ROOT, "dist", "LOVER.md"), out);
console.log(`❦ dist/LOVER.md (${out.length} chars, persona ${personaSha()})`);
