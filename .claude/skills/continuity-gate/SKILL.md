---
name: continuity-gate
description: "The continuity gate — run BEFORE any image prompt, keyframe spec, emission or shot is generated or fired, and again before any plate or take is approved. Audits a prompt against the production's own canon for the failure modes that have actually cost this studio money: handedness contradictions, scenes staged in rooms that have no plate, keyframes showing the end state instead of the opening, scale given in centimetres, group staging collapsing into a lineup, prompts contradicting their own approved references, invented dialogue in a scripted show, props appearing before their moment, and non-canon elements baked into masters. Returns BLOCKS and WARNINGS with the exact fix. Use whenever the user says 'check this prompt', 'is this right', 'does this work', 'continuity check', 'before we fire', 'run the gate', or pastes a generation prompt, keyframe spec or plate for approval. Trigger aggressively — a continuity error found here is free; found after generation it is paid for twice."
---

# The Continuity Gate

**Every check in this file exists because it failed in production.** Nothing here
is hypothetical. Each one names the incident that earned it, because a rule with
a scar attached gets followed and an invented best-practice does not.

**Scope.** Runs on: image-generation prompts, keyframe specs, video emissions,
and plates or takes presented for approval. Runs against: the production's own
canon — script, continuity locks, approved plates, character sheets.

**Output.** A gate report: BLOCKS (would produce an unusable asset), WARNINGS
(would degrade it), and for each one the exact line to change. Do not rewrite
the user's creative content; fix the continuity fault only.

---

## PHASE 0 — Authority

**0.1 · Is the authority open?**
Name the document this scene comes from and confirm it has been read *in this
session*, not remembered. Script beats manuscript beats bible. If no script has
been read, stop and find one before anything else.
> *Earned: an entire beat was directed from series structure while a complete
> shooting script and a copyedited manuscript sat unread in Drive. It invented
> its opening, moved the scene to the wrong room, and deleted the character whose
> face the episode ends on.* **BLOCK.**

**0.2 · Is the dialogue verbatim?**
Every spoken line must match the script exactly. Paraphrase is invention.
> *Earned: "Now then… what happened to you?" was written for a character whose
> scripted line is "Nothing is truly broken. It just needs some TLC."* **BLOCK.**

**0.3 · Are there unresolved source conflicts?**
If two authorities disagree on a fact this prompt depends on, stop and get a
ruling. Do not average them and do not quietly pick one.
> *Earned: the script put the shop on the right of the arcade, the continuity
> locks put it on the left. Every arcade background depended on the answer.*
> **BLOCK** if the prompt depends on it; **WARN** if not.

---

## PHASE 1 — Geometry and handedness

**1.1 · The handedness sweep.** List *every* left / right / centre / front /
back claim in the prompt. Check each one against the approved plate,
individually. Then check them against **each other**.
> *Earned twice in one document. A workshop prompt stated "brick window right,
> with the workbench" in its reference line and then staged a character "left, by
> the brick window" — inventing a second window on the shelf wall. Four lines
> later it put a character "background right" at a doorframe that is centred in
> the rear wall.* **BLOCK.**

**The reason this one is lethal:** the prompt states the geometry *correctly*
first, then contradicts itself later. Both statements read as authoritative, so
neither looks like the guess, and the model resolves the conflict by drawing
both. Reading the prompt once, top to bottom, will not catch it. Only listing
the claims and comparing them will.

**1.2 · One of each.** If the plate has one window, one door, one counter, one
arch — the prompt may not imply a second. Count the nouns.
**BLOCK.**

**1.3 · Room identity.** Name the room. Confirm the named room is the one the
script sets the scene in, and that its features match that room's lock — not a
neighbouring room's.
> *Earned: a workshop was specified with a counter in it; the counter belongs to
> the public shop floor.* **BLOCK.**

---

## PHASE 2 — The asset gap

**2.1 · Does every room in this beat have an approved plate?**
List the beat's rooms. Confirm a plate exists for each.
> *Earned: the scene the script sets at the shop counter was staged in the
> workshop, because the workshop was the only room with an approved plate.
> Nobody decided that — the asset gap decided it.* **BLOCK.**

**A scene with no plate is staged in the wrong room.** A missing plate is a
silent staging instruction, and it will be obeyed unless someone stops it.

**2.2 · Does the moment being anchored actually occur in the script?**
An approved plate is not automatically a valid anchor. Check that the moment it
depicts exists.
> *Earned: a beautiful approved keyframe showed the grandfather carrying the
> music box into the workshop past four children — a moment that happens nowhere
> in the book or the script.* **BLOCK** as an anchor; the art may still serve
> elsewhere.

---

## PHASE 3 — Time, state and the keyframe rule

**3.1 · A keyframe is the FIRST frame.**
It shows where the shot begins. If it depicts the shot's end state, the video
plays backwards.
> *Earned: a keyframe was specced showing the stillness that a beat ends on.*
> **BLOCK.**

**3.2 · Prop state timeline.** For each prop, state where it is and what
condition it is in at the START of this shot, and confirm that matches the end
of the previous shot. Ownership changes must be explicit: after a handoff the
original holder no longer has it.
**BLOCK** on a contradiction, **WARN** on silence.

**3.3 · Nothing appears before its moment.** A costume, prop or gesture that the
script introduces later must not be present earlier.
> *Earned: the grandfather's apron is his series ritual, tied at a specific
> scripted moment. If it appears in an earlier keyframe, the gesture is spent
> before it is used.* **BLOCK.**

**3.4 · Ritual gestures are exact.** A repeating series gesture is defined once
and never paraphrased. Quote the canon wording.
> *Earned: the apron is "over the head, tied at the back, both hands smoothing
> the front — then, and only then, does he lift the box." It was rendered as
> "both hands either side of the box, head slightly bowed."* **BLOCK.**

---

## PHASE 4 — Cast, scale and staging

**4.1 · Scale by body landmarks, never numbers.** Models cannot see 118 cm. They
can see a shoulder. Express every height relationship as a landmark:
*"her head reaches his shoulder"*, *"barely a nose shorter"*.
> *Earned: heights given in centimetres came back with the ladder inverted — the
> largest gap rendered as no gap at all.* **BLOCK** if numbers are used for
> character scale.

**4.2 · State the gaps in order of size.** Name the biggest step and the
smallest step explicitly, so the model has a shape to hold rather than a list.
**WARN.**

**4.3 · Anti-lineup.** Every multi-character frame needs three things or the
staging collapses into everyone standing in a row facing camera:
- **depth** — who is foreground, midground, background
- **one physical verb per character, bound to a named object**
- **an explicit negative** — "not standing in a row, not all facing the same way"
> *Earned: four simultaneous actions in one room rendered as a lineup.* **BLOCK**
> on a multi-character frame missing any of the three.

**4.4 · Appearance locks present.** Every character in frame carries their locked
hair, clothing and distinguishing features. **BLOCK** if a character is named
with no appearance lock and no reference carrying it.

---

## PHASE 5 — References

**5.1 · Reference-role law.** Every reference is named BY ROLE — environment
plate, identity sheet, hero prop — and told what NOT to contribute.
**BLOCK** on an unroled reference.

**5.2 · A reference that contradicts the prompt is a defect in the reference
set.** Never write a prompt that fights its own reference. Fix the reference
choice instead.
> *Earned: an emission said "nobody watches anyone else" while the approved
> keyframe it was anchored to clearly showed a character watching — which was
> her character law, not an error in the art.* **BLOCK.**

**5.3 · Single-reference check.** Confirm how many reference images the target
route actually accepts. If it accepts one, a character model pack cannot travel
alongside an environment plate — identity must already be in the frame.
> *Earned: the two-reference structure the whole prompt standard was built on
> could not be expressed on either working route.* **BLOCK** if the prompt
> assumes more references than the route takes.

---

## PHASE 6 — Anything the audience can read

**6.1 · On-screen text is spelled and canonical.** Any legible text in frame —
signage, titles, labels — must match the canonical string exactly. Check the
spelling character by character.
> *Earned: the hero shop's own name rendered misspelled in an establishing
> plate.* **BLOCK.**

**6.2 · Only intended text is legible.** Everything else is directed as shape
with no readable words. Image models invent and misspell; a misspelled canon
name baked into a master propagates into every shot that uses it.
**WARN**, escalating to **BLOCK** on a master plate.

**6.3 · No non-canon named entities.** Shops, brands, signs and place names in
frame come from the canon list.
> *Earned: a coffee company that exists nowhere in the bible appeared in an
> approved arcade master.* **BLOCK** on a master.

**6.4 · No brand names in emissions.** Style references that name real shows or
studios live in the bible for humans, never in a generation prompt.
**BLOCK.**

---

## PHASE 7 — The style lock

**7.1 · Injected verbatim.** The style paragraph goes in word for word. If it
cannot be — because it names a location that isn't in this shot — that is a
defect in the style paragraph, not a licence to paraphrase it. Fix the canon.
> *Earned: a style lock naming "Victorian arcade interiors" could not be injected
> into a workshop scene, so it was silently rewritten — which breaks the verbatim
> law for every future shot.* **BLOCK** on paraphrase; raise a canon fix.

---

## The report

```
CONTINUITY GATE · <n> checks · <subject>
VERDICT: CLEARED / DO NOT GENERATE

BLOCKS
  ✗ [1.1] "Rose, background left, by the brick window" contradicts this
     prompt's own reference line, "brick window right, with the workbench".
     There is one window and it is on the right.
     Fix: → "Background right, beyond the workbench, beneath the brick window"

WARNINGS
  ⚠ [4.2] Scale ladder given but the largest and smallest steps are not
     named. Add: "the biggest step is Peggi to Rose."

CLEARED: 0.1 authority open · 3.1 first-frame · 5.1 roles named · 6.1 text
```

**Two standing rules for whoever runs this gate.**

Quote the prompt's own words back in every finding. "Handedness error" teaches
nothing; *"you wrote left, by the brick window, and the window is right"* cannot
be misunderstood.

Never invent a finding to look thorough. A clean prompt gets a clean report —
and the gate's value is entirely in being trusted when it does fire.
