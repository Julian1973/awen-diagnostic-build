# STUDIO MEMORY — the hybrid production OS

**One script in, one film out, on any provider.**

Three systems merged: Julian's Production OS spec (the application), the
Higgsfield eleven-stage pipeline (the stages and the two gates), and the laws
this studio earned the expensive way shooting Thistlewood's Episode 1 (the
things that only show up once you have actually fired a few hundred pounds of
generations at a scripted scene with a cast).

Where they disagree, the reason is written down.

---

## The premise everything rests on

**The model has no memory between generations, so the application is the
memory.** A face is redrawn from scratch every time; if what he looks like is
not in the request, the request gets a different man. Half of what follows
exists only to remember things on the model's behalf.

And one line the other two systems do not say, which this one has paid for:

> **A prompt is a list of things the model may draw. Anything it names that is
> not in the frame is a gap the model will fill.**

That is why the room scope exists, and it is the single most useful sentence in
this document.

---

## The four rules

1. **Nothing generates for the film until every asset it uses is locked.**
2. **One asset, one passport** — an exhaustive descriptor plus reference files,
   copied verbatim into every prompt that uses it. Never shortened.
3. **Edits are surgical** — one declared change per version, everything else
   byte-identical, so the next take isolates a single variable.
4. **Everything is versioned and logged**, because an unlogged good shot is a
   shot you cannot reproduce.

---

## The stages

```
PRE-PRODUCTION (in reverse)        GATE A          PRODUCTION            FINISHING
1 breakdown   script → shot cards  boards          6 generate            9  colour
2 references  images as spec       decided         7 sync   ⟨EARNED⟩     10 sound
3 bible lock  written decisions      ↓             8 assemble            11 master
4 passports   descriptor + files   GATE B          (edit runs in
5 stress test proved to 10/10      rows locked      parallel)
                                     ↓
                                   GATE C ⟨EARNED⟩  prompt audited ≥ floor
                                   GATE D ⟨EARNED⟩  speaker box where needed
```

Stages 1–5 close before anything renders. Stages 9–11 are human. Stages 6–8 are
the loop this application drives.

**Stage 7 does not exist in either source system**, and it is the one that made
the difference between a take you can cut and a take you cannot. See below.

---

## The gates

Nothing is a gate unless the software refuses.

| | Gate | Refuses when |
|---|---|---|
| **A** | Boards decided | any reference board a shot depends on is still `pending` |
| **B** | Rows locked | any required asset is not `locked` — checked at compile **and again at submit**, because an asset can be deprecated in between |
| **C** ⟨EARNED⟩ | Prompt audited | the current prompt text has no passing audit round **of its own** |
| **D** ⟨EARNED⟩ | Speaker assigned | a multi-face shot has a line and no speaker box |

### Gate C, and why the hash matters

The audit is a **loop**, not a stamp:

```
compile → generator → score
   ├─ ≥ floor → record the round, fire
   └─ < floor → apply what it said → NEW text, NEW hash
                → back through the generator → repeat
```

Rounds are stamped against a hash of the exact text they scored. **Only a round
whose hash matches the current text counts.** A correction produces a prompt
that has never been scored — that is the entire point, and it is the thing a
simple "audited: yes" flag gets wrong.

> *Earned: a prompt was rewritten materially — seven new reference bindings and
> a different route — and fired against the audit of the version before the
> change. Then, once a stamp existed, it recorded that an audit had happened
> without forcing the cycle when one failed.*

At `simplify_at` attempts the application stops offering to reword and says the
**shot** is wrong: split the beat, drop an action, change the angle. At
`attempt_cap` it refuses further attempts on that framing.

---

## Stage 7 · the sync pass, and the disagreement

Both source systems assume the video model lip-syncs and a sound team cleans
the result afterwards. **For a production with a cast that is backwards**, and
this is the one place this spec overrules both.

- The route generates speech **from the prompt** and animates the mouth to what
  it invented. Our recording then plays over the top. The two can never agree.
- So: **no dialogue words in a prompt, ever.** The mouth is directed only as a
  talking rhythm, and the prompt says *why*, so a later editor does not helpfully
  put the line back.
- The recorded line drives the mouth in a separate pass afterwards.

**And the sync route cannot be told which face to drive.** Not one of the five
measured accepts a face selector. On a two-shot it finds a face and drives it —
the first time it ran it put one man's line on the other man's mouth, which is
the speaker law failing one stage further downstream than the speaker law can
reach.

So a multi-face shot declares a **speaker box**: the region containing the
speaker and nobody else. The pipeline crops it, upscales so the face is big
enough for the model, syncs, scales back and composites at the same
coordinates. Only the mouth changed inside that rectangle, so everything around
it lands on identical pixels.

`LipsyncProvider.sync()` deliberately takes **no face argument**, so the
limitation cannot be forgotten at a call site.

---

## Stage 5 · the stress test

From Higgsfield, and the stage this studio most conspicuously lacked.

An asset generates under combat conditions before it is trusted: every angle,
every shot size, **the lighting of its actual scenes**, and a two-shot beside
every asset it will share a frame with. Cheap stills, before one expensive video
render. Characters must hit `repeatability_req` out of `repeatability_req`.
Anything less keeps the row at `draft` and the scene it blocks stays closed.

**Why it matters more here than in either source system:** our character sheets
travel as references on *every single shot*. An untested sheet is a fault
multiplied by every shot the character appears in.

> *Two faults were found on screen, at render cost, that a page of stills would
> have caught: a character smiling through three consecutive shots about his
> grandmother's broken heirloom, and a hero prop that was a soft gathered cloth
> in one shot and a crisp rectangular parcel eleven seconds later.*

---

## The first frame ⟨EARNED⟩

Where a shot's opening frame comes from is a per-shot decision, not a house
style.

| `frame_source` | Image 1 is | Use when |
|---|---|---|
| `keyframe` | a still generated for this shot | the shot opens a new setup, a new room, or a composition nothing else can imply |
| `chain_continue` | the previous take's **last frame** | the camera holds — that frame *is* this first frame |
| `chain_cut` | the previous take's last frame, as **continuity only** | the camera cuts — it carries prop state, lamp state and colour, never framing |

**Chaining is the stronger default.** The room cannot drift when Image 1 *is*
the previous frame rather than a fresh generation of the same room — a shot
inherited an opened box on a cloth from its predecessor without either prompt
describing the handover.

Generate keyframes per **setup**, not per shot. It also collapses the human
bottleneck: a scene needs three or four, not eighteen.

**And when a keyframe is needed, a human makes it.** The registry keeps a
`manual` image provider for exactly this. It is the slowest route per image and
by some distance the most accurate: a generated keyframe turned an archway into
a curtained recess and lost a door bell; the hand-made one held every lock.

---

## Room scope ⟨EARNED⟩

Every shot declares how much of its location the frame actually shows.

| `room_scope` | The prompt says |
|---|---|
| `full` | the plate description and the one-of-each lock |
| `partial` | a shallow soft slice, with the arch, the door, the cabinet named as explicitly **out** of shot |
| `none` | nothing behind but soft darkness, forbidding window, doorway and cabinet walls by name |

> *Earned: a tight insert of a counter top was handed the standard scene clause
> reciting the whole shop. The take pulled back and built a bright kitchen with a
> window in it, two stops cooler than the shots either side. The keyframe was not
> ignored — it was COMPLETED.*

**The test before writing any scene clause: is this visible in the frame?** If
not it does not belong in the prompt, and on a tight frame say so explicitly,
because silence is a gap too.

---

## Scale by landmark, never by number ⟨EARNED⟩

`assets.scale_landmark` holds *"her head reaches his shoulder"*, never a
measurement.

> *Earned: heights given in centimetres came back with the ladder inverted and
> the largest gap rendered as no gap at all. Models cannot see 118cm. They can
> see a shoulder.*

Distances in **metres for location geometry** are fine and come from Higgsfield —
that is a different thing from character scale, and the ban applies only to
bodies.

---

## Direct the face ⟨EARNED⟩

Body comes from the secondary-life block, voice from the delivery note, the
mouth from the speaker law — and an **expression** left unstated is filled in
with the average of every similar scene the model has seen, which is *pleasant*.

`assets.default_expression` and a per-shot override. Where the beat needs it,
the words **not smiling**.

---

## The prompt

The compiler emits the grammar the resolved provider declares, and **only** the
section labels that grammar actually defines. Inventing structure that reads
plausible is a failure mode with a name here.

> *Earned: a compiler emitted `[First Frame]`, `[Subject and Action]`,
> `[Camera]`, `[Performance]`, `[Secondary Life]`, `[Speech]`, `[Physics]` —
> none of which appear anywhere in the provider's guide.*

The compiler receives **only**: one validated shot card, immutable snapshots of
locked assets, approved board decisions, and project output settings. It never
queries "latest asset by tag" after a snapshot exists, or prompt history stops
being reproducible.

Blocks worth keeping from the Higgsfield fifteen, because each buys something
measurable: the exact character count with no duplicates; every reference stating
what it controls **and what it must not touch**; one lens per shot with field of
view changing only on a hard cut; action in timed beats; physics that persists;
light shaped from the location's own sources; a colour ratio in the style block.

**Open question, deliberately not adopted:** Higgsfield writes *no negative
prompts* — every prohibition rewritten as what IS in frame. Our prompts are full
of "do not" and are currently producing approved takes. It is a real
methodological difference and it deserves a controlled A/B on one shot, not a
compiler rewrite on the strength of an article.

---

## The file tree

```
assets/       passports: characters, locations, props
prompts/      shot cards and every prompt version
generations/  raw attempts — nobody but the prompt engineer goes in
selects/      accepted takes ONLY — the single folder the edit can see
edit/ color/ sound/ master/
docs/         breakdown, bible, registry, generation log, the bank
```

Provider URLs are temporary. Completed files are copied to owned storage before
anything downstream points at them.

**A reference file is never renamed.** A new version is a new row, because
renaming breaks every prompt version pointing at the old path.

---

## The bank ⟨EARNED⟩

`lessons` is not documentation. Every law above started as a row in it, and each
row names the check that now enforces it.

> A rule with a scar attached gets followed. An invented best-practice does not.

A rejected take is worth as much as an approved one if the shape of its failure
is written down.

---

## Finishing stays human

Edit, cleanup, colour, sound and master. The application generates picture and
scratch audio and stops there on purpose.

Two craft notes that cost nothing and are worth obeying: **trim the drift at the
edges of every generation** — the tail especially, where a held ending turns into
a slow slide — and **cut harder than feels natural**, because generated shots
lean into slow entries.

---

## Definition of ready

- Credentials never reach the browser.
- A shot cannot generate on a draft or deprecated asset.
- A shot cannot generate on a prompt whose current text has not passed the audit.
- A multi-face shot cannot sync without a speaker box.
- A crash cannot lose job state or double-charge a provider request.
- Every provider output is archived under our control.
- Every selected take can reconstruct its prompt, payload, asset versions and
  review decision.
- Human review is the final acceptance gate.
- **The provider can be changed through the adapter rather than a rewrite** —
  which is the whole reason the capability flags are branched on rather than
  merely documented.
