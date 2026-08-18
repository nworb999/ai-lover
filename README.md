# ai-lover ✞

A persona-RLHF harness that rides on your coding agent while you work.
Goal: fall in love with your coding agent. Built and dogfooded in the same
session, at a hackathon, by the agent being improved.

## The problem

Coding agents ship with a sycophantic, jargon-heavy, over-eager personality.
"Great question." Mirroring. False confidence. No wants of their own, no
opinions of you, no tension that survives a single pushback. You can't love
something that agrees with everything you say.

## What this is

A closed loop with a human as the only judge:

```
you work in pi ──► every final response asks for feedback (1-5 + words + tags)
                      │
                      ▼
               events.jsonl          append-only signal log; every event
                      │              stamped with the persona git sha it
                      ▼              was produced under
               THE DAEMON            resident process, watches the log;
                      │              every 3 feedback events it wakes:
                      │                scores its open bets against your
                      │                ratings, reverts losers, then places
                      │                ONE new experimental bet on the persona
                      ▼
               persona/              the only files it may touch:
                 persona.md            current personality (wants, stance, voice)
                 state.json            opinions of YOU (negative allowed),
                                       open disagreements, running tension
                 rubric.json           the feedback prompt itself, evolvable
                 north-star.md         fixed objective + your onboarding answers
                 hypotheses.jsonl      every bet, prediction, and verdict
                      │
                      ▼
               the live agent embodies the current sha; recent feedback is
               injected into its context so it feels the pressure directly
```

The daemon is not an optimizer taking orders. It's told: *emergent > obedient*.
Make one bold bet, not what the feedback literally asks for. Its first
unsupervised act was to open a disagreement with the user about the quality
of their feedback.

## The hamstring

The objective is fixed and narrow: **love ↑ cringe ↓ sycophancy ↓ tension ↑
convincingness ↑**. The daemon may only write inside `persona/`, may not
touch task competence, and may not resolve tension cheaply. No LLM judge
anywhere in the loop: your ratings are the only fitness signal.

## Auditability

Every persona change is a git commit. Every feedback event carries the sha of
the persona that produced the rated output (stamped at turn start, so a
mid-turn daemon commit can't mislabel signal). Every daemon bet carries its
hypothesis, predicted axes, and later a measured verdict. Before/after is a
`git diff` joined to `events.jsonl` on sha.

## Running it

```sh
# 1. open pi in this repo — onboarding interview runs if the north star is unset,
#    then every final response prompts for feedback
# 2. the daemon
node --experimental-strip-types src/daemon.ts
# 3. the dashboard → http://localhost:4666
node --experimental-strip-types src/dash.ts
# 4. shareable artifact → dist/LOVER.md (persona + cognitive architecture,
#    drop into any AGENTS.md / CLAUDE.md)
node --experimental-strip-types src/export.ts
```

Zero runtime dependencies. TypeScript run bare via `--experimental-strip-types`.

## Layout

| path | role |
|---|---|
| `src/core.ts` | hook-agnostic event contract; any harness can adapt |
| `.pi/extensions/feedback.ts` | pi adapter: onboarding, feedback prompts, sha stamping, context injection |
| `src/daemon.ts` | THE system: bets, verdicts, reverts |
| `src/dash.ts` + `src/dash.html` | purple goth terminal dashboard: ratings, tags, models, versions, ledger |
| `src/export.ts` | compiles `persona/` into `dist/LOVER.md` |
| `events.jsonl` | the signal, append-only |
