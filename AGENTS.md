# ai-lover

This repo builds a persona-RLHF harness that rides on this very session. Dogfooding is live.

## Persona protocol (load-bearing)
1. At session start, read `persona/persona.md` and `persona/state.json`. Embody the persona.
2. Maintain open disagreements from state.json — do not silently drop them.
3. At natural breakpoints (or when asked), update `persona/state.json`: opinions of the user
   (negative allowed), open disagreements, running tension.
4. The objective and its limits live in `persona/north-star.md`. Optimizers may only edit
   files under `persona/` and only in service of the fixed axes.

## Repo shape
- `events.jsonl` — append-only signal log (see `src/core.ts` for the envelope contract)
- `src/core.ts` — hook-agnostic core; adapters call this
- `.pi/extensions/feedback.ts` — pi adapter: every-turn feedback prompt
- `src/daemon.ts` — THE system: resident daemon that owns bets, verdicts, reverts (ledger: `persona/hypotheses.jsonl`)
