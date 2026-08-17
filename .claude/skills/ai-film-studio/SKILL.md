---
name: ai-film-studio
description: "The provider-agnostic AI film and animation studio — turning any script into finished shots on any image/video/voice/lipsync stack. Use for ANY generative film or animation production work: breaking a script into scenes and shot cards, building reference boards and asset passports, stress-testing assets before they lock, compiling and auditing shot prompts, firing generations, driving mouths from recorded dialogue, assembling sound, cutting sequences, and setting up the studio for a new project or a new provider. Triggers on 'new film', 'new project', 'break down this script', 'shot card', 'asset passport', 'reference board', 'stress test', 'lock the assets', 'compile the prompt', 'fire the shot', 'lipsync', 'which model should we use', 'set up the studio', or any AI film/animation pipeline question. Reads studio/SPEC.md for the full system and studio/providers.json for the current stack."
---

# The AI film studio

**One script in, one film out, on any provider.**

Full system: `studio/SPEC.md`. Current stack: `studio/providers.json`.
Schema: `studio/schema.sql`. Adapter: `studio/adapter.ts`.

Every law below was paid for by a rejected take. **A rule with a scar attached
gets followed; an invented best-practice does not.**

---

## The premise

**The model has no memory between generations, so the pipeline is the memory.**
A face is redrawn from scratch every time. If what he looks like is not in the
request, the request gets a different man.

And the sentence that prevents the most damage:

> **A prompt is a list of things the model may draw. Anything it names that is
> not in the frame is a gap the model will fill.**

---

## Never name a model, name a capability

Read `providers.json` and resolve. The pipeline **branches** on capability flags
— they are not documentation:

| Flag | What it decides |
|---|---|
| `speech: generated` | dialogue words must NOT enter the prompt |
| `first_frame: false` | composition must be asserted, not assumed |
| `face_select: false` | a multi-face shot needs a speaker box |
| `refs_max` | how long a reference set may be |
| `dur` | shorter beats are shot at the floor and trimmed |

Swap a row, the studio moves. Nothing above the adapter names a model.

---

## The order, and the four gates

```
breakdown → references → bible lock → passports → stress test
   → GATE A boards decided   → GATE B rows locked
   → compile → GATE C audited ≥ floor → GATE D speaker assigned
   → fire → sync → assemble → cut → human finishing
```

Nothing is a gate unless it **refuses**.

---

## The operating loop, one beat at a time

1. **Frame source.** `chain_cut` / `chain_continue` by default; a generated
   keyframe only when the shot opens a new setup or a composition nothing else
   can imply. Keyframes are per SETUP, not per shot.
2. **A human makes the keyframe** when one is needed. Slowest per image, by
   some distance the most accurate.
3. **Compile** in the provider's own grammar. Use only the section labels that
   grammar defines — inventing plausible-looking structure is a named failure.
4. **Audit as a LOOP** until it clears the floor. Score, correct, **re-score the
   corrected text** — a correction is a new prompt that has never been scored.
   Stamp every round against the text's hash.
5. **Show the brief before firing** — every reference in order, the audio and
   where it goes, the sound bed, the audit state, the prompt in full. Compile
   fresh; never read a prompt off disk.
6. **Fire**, then **sync**, then **assemble**, then **cut**.
7. **Bank the verdict.** Approved or rejected, name the reusable shape.

At `simplify_at` attempts, stop rewording: **the shot is wrong, not the
sentence.** Split the beat, drop an action, change the angle.

---

## The laws

**No dialogue words in a prompt, ever** (when `speech: generated`). The mouth is
directed as a talking rhythm and the prompt says *why*, so nobody helpfully puts
the line back.

**The speaker box.** No lipsync route measured can be told which face to drive.
A multi-face shot declares the region holding the speaker and nobody else; crop,
upscale, sync, composite back.

**Describe the frame, not the location.** `room_scope` full / partial / none.
Test before writing any scene clause: *is this visible in the frame?*

**Every character and prop bound to a reference**, each told what to use and what
**not** to contribute. Order is the contract — the prompt names Image 1..N by
position, so compiler and submitter walk the same list.

**Scale by body landmark, never by number.** Metres for location geometry is
fine; centimetres for a body is not.

**Direct the face.** An unstated expression is filled in with the average, which
is *pleasant*. Where the beat needs it, say **not smiling**.

**One asset, one passport**, copied verbatim, never shortened. A state variant is
its own tagged asset. A reference file is never renamed.

**Approval does not survive a set change.** When a plate, lock or script line
moves, every approved asset downstream is provisional again. Review a scene on
one contact sheet, not shot by shot.

**Trim the drift at the edges**, the tail especially. Cut harder than feels
natural.

---

## When something comes back wrong

Ask in this order:

1. Did the prompt **name something not in the frame**? (room, prop, a face in a
   hands-only insert)
2. Did two authoritative statements **contradict** each other? The model resolves
   a conflict by drawing both.
3. Was a channel **left undirected**? Body, voice, mouth and face are four.
4. Is the reference set **stale, unbound, or in the wrong order**?
5. Only then: is it the wording? Past `simplify_at`, it is not.

Then write the lesson down with the take it cost.
