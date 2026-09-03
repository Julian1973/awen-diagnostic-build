# Scene Entry Preflight — cast before direction

**Controlled pipeline document · v1.0 · 3 September 2026**

One page, run once per scene, before any direction is written or any frame is
fired. It exists because of a specific morning.

## The incident

Ep1 Scene 1, 3 September. Two shots, both blocked at **approval** time with the
same cascade:

```
STUB ROLE OFF-FRAME — Teacher has no locked identity reference and is not in
  the opening frame; staged as an unnamed presence, no reference attached
CAST CANON INCOMPLETE — Teacher has no locked identity pack
REFUSED — Animation direction is stale (animation-compiler-output-stale)
```

Then the same again for a Classmate on the next shot. Three rejected takes on
each shot, and the true fault was knowable before the first fire: **the
direction staged characters that nothing could draw.** The model was never
given a Teacher, so it invented a stranger — and the refusal only arrived after
the spend.

The root cause was not a bug. It was that the show's supporting cast was never
canon-locked, and nothing checked for that until the last possible moment.

## The law

> **A character staged on screen with no identity reference is an invented
> stranger. Decide every role's status before the scene is directed, not after
> it is rendered.**

Every character a scene stages is exactly one of two things, declared:

| Status | Meaning | Requirement |
|---|---|---|
| **Named cast** | The audience must recognise them; they speak, act, or recur | A locked, single-subject identity pack, attached as its own reference slot on every shot they appear in |
| **Unnamed presence** | Background human furniture; no line, never recognised again | Kept OUT of the named cast, never named in the prompt, no reference attached |

There is no third state. A named character without a pack is not a "stub" the
pipeline can proceed past — it is a stranger waiting to be invented.

## The preflight, per scene

Run before writing direction for a new scene:

1. **List every character the scene stages**, across all its shots.
2. **Classify each one** — named cast or unnamed presence. Decide deliberately:
   locking a role costs a turnaround, a canon entry, and a reference slot on
   every shot they appear in, which comes out of the route's reference budget.
   Lock only what the audience must recognise.
3. **Check the locks** against the show's identity packs. In `studioai`:
   `python3 engine/cb_canon.py status <Episode>` — its summary line ends with
   `stubs: …`, the definitive list of who is not production-ready.
4. **Close every gap** before direction: build the single-subject turnaround
   (the subject alone in frame — the requirement is literal), add the pack,
   canon-lock it.
5. **Only then** write or re-prepare direction, fire, and approve.

## Ordering is not optional

Cast is an input to the prompt compile. Clearing a stale direction before
fixing the cast just re-stales it the moment the cast changes:

```
cast locked  →  direction prepared  →  fired  →  approved
```

Reverse any two of those and the work is done twice.

## Enforcement

- **This engine:** gate `M · CAST_UNREFERENCED` refuses a shot whose staged
  cast, speaker, or ensemble manifest names anyone with no character reference
  attached — at compile time, before any provider is contacted. It names both
  legitimate exits in the refusal, so the fix is never a guess.
- **studioai (to port):** the cast-canon check currently fires inside
  `_identity_pack_for` at generation, surfacing at approval. It should run when
  a direction first stages a character, and a scene-level preflight should
  report every stub across all shots at once — one report instead of a
  shot-by-shot discovery. The readiness badge should consult the same check;
  today a shot reads "Ready to fire animation" while the cast gate will refuse
  it.

## The related trap on the same morning

Both blocked shots were 30 seconds carrying five or six causal stages (a read,
a wrong word, public embarrassment, a character entrance, a line, a corrected
retry, a held landing). Thirty seconds is a ceiling, not a target, and the
house rule is **no more than three causal stages and three motivated views per
generation**. An overloaded shot and an unreferenced cast compound: each retake
costs more and teaches less. Split first, then lock, then direct.
