---
name: seedance-shot-extension
description: "Continuing a Seedance 2.5 shot past its generation boundary — forward/backward extension and bridges between approved clips. An extension treats the prior clip as ground truth and carries only the delta: already-true facts stated as do-not-repeat, 2-3 identity anchors, lighting carried verbatim, task type pinned to extend, and every bridge declaring one sole geography master. Use when extending a clip, continuing a sequence, chaining segments past 30 seconds, or bridging two approved clips. Sibling of seedance-scene-wrapper, which owns scene grammar and held-frame chaining."
---

# seedance-shot-extension

**An extension treats the prior clip as ground truth and carries only the
delta. Anything the prompt re-describes, the model will re-perform.**

Use this skill whenever generating the next segment of a multi-shot Seedance
2.5 sequence: forward extension, backward extension, or a bridge between two
approved clips.

---

## Choose the continuation lane first

Two lanes exist, and the route's capability decides — never habit:

| Lane | When | Governed by |
|---|---|---|
| **Clip extension** (`extension` block, this skill) | The route accepts a source video and a pinned Extend task (Seedance 2.5 native) | Gate L |
| **Held-frame chain** (`frame_source: chain_cut / chain_continue`) | The route composes from images only (reference-to-video routes with no video-extend) | Gate H, wrapper skill |

Both lanes obey the same continuity philosophy; they differ only in what
carries the join — the clip itself, or its held final frame.

## The core rules

1. **Extend from the actual clip, not a still.** The last-frame still is a
   QA reference for verifying the starting state — never the primary input
   on this lane.
2. **Say `@Video1`, never "reference @Video1".** The word *reference* pushes
   the model toward generating a lookalike instead of continuing the real
   footage. The compiler emits the bare tag.
3. **Trim the source.** If the clip runs past ~15 seconds, trim to the final
   segment whose ending you are continuing before uploading.
4. **Pin Task Type to `extend`.** Left on Auto, a loosely-worded
   continuation is read as a brand-new clip request. This is a request
   field, never an inference.
5. **The delta law.** State what is *already true* — completed actions,
   current positions, prop and lighting state — as do-not-repeat facts, then
   describe ONLY the new action, camera move and end state. The documented
   failure is a completed action replaying at the cut: a door closing twice.
6. **2–3 identity anchors, never more.** Visually distinctive, verifiable
   traits (rust-red jumper, grey checked collar). Over-specifying invites
   contradictions — a biography is a liability. Restate anchors after
   occlusion, re-entry, or a major angle change.
7. **Re-anchor from originals.** When drift is systemic, re-anchor from the
   original character reference — never from a generated frame; errors
   compound round over round.
8. **Reuse the same labelled references every round.** One character
   reference, one location reference, re-attached each round — never
   re-described in prose.
9. **Carry lighting as literal repeated text** — lighting is what slips on
   chains (a room rendering warmer mid-sequence). Write it once as
   Source → Direction → Quality → Effect and repeat it word-for-word.
10. **State vs identity are different continuity types.** Soot, wetness,
    damage are STATE facts and need their own carry rule ("soot accumulates
    and never resets") inside `already_true`; identity anchors never change.
11. **A bridge declares one sole geography master.** Bridges and backward
    extensions are the highest-risk case for props and characters landing in
    the wrong place. Reject a technically smooth bridge that changes story
    logic, identity or geography.
12. **Budget one grading pass across any chained sequence** — even a good
    run needs the colourist. Plan it; don't discover it.

## The extension block schema

```json
{
  "extension": {
    "mode": "forward",
    "source_clip": "S8_take3",
    "task_type": "extend",
    "already_true": [
      "the door is already closed — do not repeat the closing motion",
      "Tom holds the bundle in both hands",
      "soot on Richard's apron accumulates and never resets"
    ],
    "identity_anchors": ["rust-red crewneck jumper", "grey checked collar"],
    "lighting": "warm amber lamplight from screen-left, soft quality, gentle shadow edges."
  }
}
```

For a bridge, add `"mode": "bridge"` and `"geography_master": "@Video1"`.

## The compiled prompt pattern

The engine compiles this from the block — never paste it as static text:

```
Extend @Video1 forward. The first frame of the extension continues
directly from the last frame of @Video1.
ALREADY TRUE — established facts; do not repeat or reintroduce them:
[already_true, joined].
Identity anchors, unchanged throughout: [anchors, joined].
Lighting, carried exactly: [lighting, verbatim].
Describe nothing that has already happened. Only the new action, camera
move and end state follow. Do not alter locked geography or the identity
anchors above.

[the new action — one verb per subject, chained with while/then]
[the camera move — tied to a triggering action, real vocabulary]
[the end state — the next segment's handoff]
```

Backward mode inverts the anchor sentence (the extension's final frame leads
into @Video1's first). Bridge mode opens with the two clips and the sole
geography master before any action.

New-action discipline (from the wrapper's laws, restated because extensions
break them most): one verb per subject; bind sequence with *while* and
*then*; the duration must fund every link of the chain — the common failure
is the clip running out one action short; tie every camera move to a subject
AND a triggering action.

## Gate L · EXTENSION_UNDERSPECIFIED

The engine **refuses** an extension when any of these hold:

- no `source_clip` named
- no `already_true` facts — completed actions will replay at the cut
- no `identity_anchors`, or more than 3 — over-specifying invites
  contradictions
- `mode: bridge` with no `geography_master`
- `task_type` not pinned to `extend`
- unknown mode (anything but forward / backward / bridge)

## QA pass after every round

- Identity anchors present and consistent?
- Any prop, wardrobe or environment detail shifted or vanished?
- Geography matches the location reference — positions and layout?
- Any completed action unintentionally repeated?
- Lighting matches the carried description (colourist eyes, not casual eyes)?
- Log the round in the shot ledger: shot ID, anchors, references used,
  already-true facts carried, and the new closing state.

## Common failures

| Symptom | Fix |
|---|---|
| Face/wardrobe drifts after 2–3 rounds | Re-anchor from ORIGINAL reference; keep anchors at 2–3; restate at risk points |
| Action repeats at the cut | The already_true block was missing or incomplete — state the completed action explicitly |
| Location/props shift between segments | Reuse the one labelled location reference every round; state spatial blocking before motion |
| Model returns the original clip unchanged | An attached reference image contradicts the video's current pose — make stills match the clip's end state exactly |
| New segment feels unrelated | Task type was Auto, or "reference @Video1" wording pushed a lookalike — pin `extend`, use the bare tag |
| Segment renders warmer/cooler than its predecessor | Lighting was remembered, not carried — repeat the lighting line verbatim |

## The contract

```
Approved clip
  → ledger entry        anchors, already-true facts, closing state recorded
  → extension block     mode, source, delta, anchors, lighting — gate L clears
  → compiled prompt     @Video1 continuation, delta only, audited ≥ house floor
  → fire                task type pinned to extend
  → QA pass             anchors, geography, repeats, lighting
  → next ledger entry   and the loop continues
```

Every join has a recorded state, every identity has its 2–3 anchors, every
bridge has one geography master, and nothing already true is ever asked for
twice.
