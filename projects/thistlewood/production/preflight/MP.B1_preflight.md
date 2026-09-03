# MP.B1 — pre-flight record
Date: Thursday 13 August 2026 · Emission: `emissions/MP.B1.txt` (4,996 chars)
Checkers run, in order: **sd25-pe v0.3.3** (official ByteDance skill, vendored) →
**seedance-preflight** (23 checks, studio's own). Firing floor: **9.5**.

## SCORE: 9.5 / 10 — CLEARED TO GENERATE

BLOCKS: none.

WARNINGS:
- ⚠ **[E3] Length discipline** — 4,996 chars, over the 2,500 mark where
  directive lines start losing weight against descriptive body. Unavoidable:
  a two-reference emission carrying the verbatim style lock, a five-character
  cardinality block and three staged events cannot fit under 2,500. Accepted
  by the director. Under the hard 5,000 ceiling with 4 chars of margin.

## Authority tie-breaks applied (sd25-pe wins on syntax and structure)
Four seedance-preflight checks were **waived by higher authority**, not passed:

| Check | Preflight wants | sd25-pe rules | Resolution |
|---|---|---|---|
| A2 / A3 timed beats | `0-5s / 5-11s` ranges | Principle 7 — never invent numeric ranges from a target duration; use nonnumeric stages | `[Stage 1..3]` blocks, each with one primary event and an explicit end state. Intent satisfied, syntax legal. |
| B5 instance counts | "Exactly one X, no duplicates" | Principle 8 — no duplicate-subject restrictions | Cardinality moved to `[Maintain Consistency]`, which the skill's own template sanctions ("the recorder's count and ownership"). |
| D1 music on/off | "No background music." | Principle 8 — no blanket negatives | Stated positively: "Audio is diegetic only — the sounds actually present in the room." |
| D4 subtitle policy | "No subtitles, no on-screen text." | Principle 8 names subtitles explicitly | Removed. Also removed from the canon style paragraph (v1.0.1). |

## What the checks confirmed
- **A1** first line is the exact standalone sentence `@Image 1 is the first frame.`
- **A5** all three stages close on an observable end state; the final end state
  is beat 2's first-frame anchor (one asset, two uses).
- **B1/B2** both references roled; `@Image 2` carries the exclusion
  ("do not use its background"). No unassigned materials, so no
  `[Unused Materials]` block is needed.
- **C1** every camera move names its target: push toward the workbench;
  in close on the hands and the box; pull back to hold the room.
- **D2** dialogue language named; **D3** the four children are declared
  listeners with mouths closed.
- **E4** actions are mechanical, not adverbial: *presses a jar into place and
  lowers her arms*; *turns the small brass key twice, then lifts both hands away*.

## Observation for the standard
With E3 structurally unavoidable on any Emission-Standard prompt, a 9.5 floor
means **every other check must be clean**. That is the intended severity — but
it should be written down rather than rediscovered each time. Proposed for
`docs/EMISSION_STANDARD.md`: E3 is a known-cost warning; the floor is met at
9.5 only with zero further findings.

## Canon change made to pass
`canon/style_paragraph.json` v1.0.0 → **v1.0.1**. v1.0.0's background clause
named *Victorian arcade interiors*, so it could not be injected verbatim into a
workshop — the first draft silently rewrote it, breaking the verbatim law.
Base text is now location-neutral; arcade / workshop / Burgundy colour moved to
`location_clauses`, appended verbatim when that location is in frame. The look
did not change. Watermark and text-in-frame negatives dropped per principle 8.

## Firing command (blocked only on credentials + the two reference images)
```
python3 engine/fire.py render \
  --prompt projects/thistlewood/production/emissions/MP.B1.txt \
  --image <TP-03 bustle keyframe> --image <TP-01 broken box, in-scene> \
  --resolution 480p --duration 12 \
  --out projects/thistlewood/production/takes/MP.B1_take1.mp4
```
Reference order is load-bearing: `@Image 1` must be the bustle keyframe,
`@Image 2` the broken box. Swapping them inverts every role declaration.
