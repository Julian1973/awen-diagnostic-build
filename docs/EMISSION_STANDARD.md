# THE EMISSION STANDARD
## Crystal Bears Studio · v1.0 · proven on four rendered beats, 2026-08-10

> The prompt is not the director. It is the provider-specific shooting
> instruction produced from already-approved direction.

This document is the compiler specification. Every rule in it was paid for by a
render — either a failure that cost money or a success that was judged a win.
Four beats of Scene 1 were produced against it and all four were accepted.

No rule names a character, a shot or a scene. It travels to any project.

---

# PART 1 — THE TEMPLATE

The emission order below is proven. Order matters: authority first, world second,
action third, negatives last.

```
[AUDIO AUTHORITY]
<audio ref> is the sole authority for voice identity, cadence, delivery, mouth
timing and silence. No alternative performance permitted. Listeners remain silent
and closed-mouth. No narration, no extra words, no subtitles or captions.
Generated dialogue is guide audio; the approved take is restored in post.

[REFERENCE AUTHORITY]           one line per asset, positive + negative scope
<ref> defines exactly one <character>: <identity attributes>. Refer to it strictly.
    Do not use its pose or background. Do not add <banned props>.
<ref> defines only the environment, scale, materials, light direction and depth.
    Do not use or invent characters from it.
<ref> is the first frame / opening frame — the final frame of the previous unit.
    Begin naturally from it: <carried state>. Match its light, staging and
    positions exactly. Do not repeat the previous unit's action.

[CAST AND STAGING]
<A> is <relative size> and stages <side>; <B> is <relative size> and stages <side>.
Exactly one <A> and one <B> throughout; no duplicates, no blended identities.

[ATTRIBUTE OWNERSHIP]           required whenever a unit introduces a new feature
<feature> appears on <owner> only. <every other character>'s face, fur and body
stay completely clean for the entire unit — no <feature> touches them, no mark of
any kind appears on them. Never copy a feature from one character to the other.

[STYLE]                         the versioned canonical paragraph, verbatim

[VOICE DIRECTION]
Dialogue language: <language>. <A> speaks <cadence signature>. <B> speaks
<cadence signature>. Only the named speaker in each shot speaks; the other listens
with mouth naturally closed. No narrator, no crowd, no added speech.

[SHOT SEQUENCE]                 2-4 shots, one clean motion idea each
Shot N — <name>. <camera behaviour naming its subject>. <action in body
mechanics>. <dialogue inside the beat, in braces, with delivery direction>.
<sound in angle brackets>. End state: <a describable frame>.

[CONSTRAINTS]                   production facts only, never quality words

[AUDIO]
No music. No subtitles, captions or on-screen text. No watermark.
No extra characters.
```

**Emit each field once.** An action stated twice in different words renders as
duplicated motion. There is no "story lock" alongside a shot plan — the shot plan
IS the story.

---

# PART 2 — SHOT GRAMMAR

**Camera names its subject.** Never a detached camera term. State what it follows,
where it starts, where it ends.

**Action is body mechanics, not route.** What tilts, what leads, what lags, at what
frequency, with what contact. "He crosses to the flower" produces nothing;
"he launches at it too hard, overshoots, swings back and arrives faster than he can
stop" produces character.

**Travel must be written.** A perfectly tracked subject reads as motionless. Any
travel beat emits: three parallax speeds; named landmarks passing the camera and
vanishing behind it; the subject changing scale as it pulls ahead and the camera
surges; the subject drifting off-centre and being recovered; occasional foreground
wipes across the lens.

**Repeated contacts escalate.** Each separated, individually readable, and visibly
larger than the last. Equal contacts are noise.

**Cut on stored energy.** When a beat loads before it releases, the cut sits at
maximum load. The reveal lives on the other side of it.

**Withhold across the cut.** A new feature is never seen in the shot that creates
it. The transfer shot cuts before the result is visible.

**Compound moves get their own shot** with the camera tracking the full arc.

**Verify before emotion.** For retroactive-intention comedy the character checks
their own state — head up, eyes dart, pats themselves — *before* performing pride.

**Name both states of a turn and the movement between them.** Not "she softens" but
"the eye-roll softens visibly into a small genuine smile as her eyes come back down."

**The payoff is the witness.** In a two-character gag, cut to the non-acting
character and hold. Their stillness and the length of the hold carry the joke. Cut
only after the speaker's line has completely finished.

**The world turns before the characters do.** In an environmental beat: the change
begins in light, sky, colour and vegetation; only then do characters react.

**Every shot ends in a describable frame.** The last shot's end state is the next
unit's opening reference.

---

# PART 3 — BEAT COSTS (versioned data)

Minimum screen seconds per beat kind. Weight reads only when a beat gets
anticipation, action and settle.

| kind | s | note |
|---|---|---|
| travel | 1.8 | steady locomotion establishing speed and direction |
| dodge | 1.0 | fast evasive beat / near-miss |
| impact | 0.8 | the contact moment |
| load_release | 2.3 | spring, wind-up, recoil — the stored force must be FELT |
| aerial | 1.8 | compound airborne move; must read as a whole |
| tumble | 1.2 | uncontrolled rotation |
| settle | 1.0 | arrival, finding balance |
| self_check | 1.2 | a character registering their OWN state |
| reaction | 1.2 | a character registering something external |
| turn | 2.0 | emotional change of state |
| environment_turn | 2.0 | the world changes state rather than a character acting |
| reveal | 1.5 | withhold-then-show |
| business | 1.5 | prop handling, deliberate small action |
| hold | ≥2.0 | the button; floor is absolute |

**Unit duration = sum + 15% margin.** A unit whose beats exceed its duration is
BLOCKED as over-stuffed. **Costs rise only when a verdict explicitly diagnoses
compression** — never because an unrelated layer failed.

---

# PART 4 — THE RULES

**R8 · Multi-shot emission.** 2–4 shots per unit. Cut placement is directed. One
clean motion idea per shot.

**R9 · Traversal.** Motion described only as blur is a BLOCK on travel beats.

**R10 · Escalation.** Repeated contacts must be separated, readable and increasing.

**R11 · Compound moves** get their own shot, camera tracking the full arc.

**R12 · Self-check.** Where a beat record marks a button as retroactive, a
self-check beat is required or the compile BLOCKS.

**R13 · The witness.** The payoff of a two-character gag is the held cut to the
non-acting character. Canon staging sides are injected verbatim.

**R14 · Action-unit exclusions.** `no cuts` and `no handheld` apply only to
continuous-relay units. Lifted for action units — they suppress energy.

**R15 · Dialogue in its beat.** Every line inside the beat where it is spoken, with
delivery direction and hold protection. A detached dialogue-placement block is a
BLOCK.

**R16 · Attribute exclusivity.** A new visible feature must state its owner AND an
explicit exclusion for every other character in frame. Counting characters is not
enough — salient features propagate.

**R19 · Conduct is invariant.** A character's physical signature — chaotic,
precise, heavy, quick — does not change with their emotional state. Confidence
does not make a clumsy character competent; calm does not make a frantic one
still. Emotional state changes what a character *intends*; the body still does
what it always does. Canon's conduct line is injected into every unit that
character appears in, action or dialogue, and any action written against it is a
BLOCK. **Learned the hard way: a character written as "controlled" for one beat
because he felt triumphant produced a flat, lifeless beat and cost a render.**

**R20 · State-handoff continuity.** The declared opening state of a unit must
match the declared end state of the unit before it — carried damage, marks,
props, position, light and mood. A mismatch means either a beat is missing from
the sequence or a state was invented. BLOCK and name the gap; never render across
an unexplained state jump. *Discovered when a skipped beat would have rendered a
character suddenly filthy with no cause on screen.*

**R17 · No internal contradiction.** If two emitted fields describe the same action,
state or staging differently, BLOCK. Stale direction fields emitted alongside a new
shot plan are the most common cause.

**R18 · State each thing once.** No field may restate an action already stated
elsewhere in the emission.

---

# PART 5 — THE PRE-FLIGHT

Run before any emission reaches a human. Mechanical only.

**FATAL (−2.0)** — will waste the generation
- internal contradiction between fields (R17)
- a reference without a role, or a role without an exclusion
- ranges that do not tile, where ranges are used
- no ending state anywhere in the unit
- dialogue present with no language declared
- beats exceed unit duration (over-stuffed)
- a new feature introduced without an exclusive owner (R16)

**FIX (−0.75)** — measurable degradation
- a travel beat with no traversal written (R9)
- repeated contacts without escalation (R10)
- a camera term with no named subject
- dialogue in a placement block rather than its beat (R15)
- a button with no hold, or a hold under 2.0s
- a compound move without its own shot (R11)
- an action restated in different words (R18)
- no music policy stated

**POLISH (−0.25)**
- length over 2,500 characters
- boilerplate applied where it does not apply
- an emotional turn naming one state rather than two
- appearance re-described alongside an accurate reference

Score from 10. **Below 8.0 does not fire.** Report format: score, verdict, each
finding with its fix line, then the clean list.

---

# PART 6 — PROVEN PATHS

Reused verbatim for their archetype until a render dethrones them.

**`false-triumph-chase`** — action. Chase with written traversal → three escalating
contacts → cut on maximum load → compound aerial in its own shot → landing →
self-check → pride → line → held cut to the witness.

**`reveal-and-deadpan-verdict`** — dialogue. Transfer shot cutting before the
result → reveal in close-up with the presenting beat → over-the-shoulder verdict
with the feature as out-of-focus foreground and the reactor in sharp focus →
eye-line travels to the feature and back → micro-tell → line → hold after.

**`escalation-into-verdict`** — composition. An action archetype joined to a
reaction archetype at the button. **Archetypes compose; the cut goes after the line
has completely finished.**

**`environment-turn`** — tonal. The world changes first (light, sky, colour,
vegetation) → the physical betrayal of the character who denies it → their cover
line → cut to the character who reads it, stilling and listening → their quiet line
→ the overcorrection that ends the unit → long hold → fade.

---

# PART 7 — IMPLEMENTATION

1. The compiler emits the Part 1 template from the typed direction record. No field
   is hand-authored; no field is emitted twice.
2. Beat costs are versioned data, not code. Unit duration derives from them and is
   set as a request parameter, never written into the prompt.
3. Canon supplies identity, staging law and banned vocabulary; the compiler injects
   them verbatim and validates them at compile.
4. Pre-flight runs on every emission and blocks below 8.0.
5. Verdicts farm: an accepted take banks its recipe as a proven path; a rejected
   take's diagnosis becomes a rule or a cost adjustment, dated, with its evidence.
6. Every rule is stated without naming a character, shot or scene. If it cannot be,
   it is a patch and does not close the defect.

---

# PART 8 — RENDER RESOLUTION POLICY (added 2026-08-13, showrunner ruling)

**Fire every beat at 480p. Upscale in post (Topaz).** Applies to all shows.

- **Resolution is a generation parameter, never prompt text.** It is set on the
  page or via the API. An emission that names a resolution is malformed.
- **The verdict at 480p judges BEAT, not detail.** A take is accepted or
  rejected on pace, staging, performance, continuity and whether the beat
  lands. Softness, line crispness and fine texture are NOT grounds for
  rejection — they are the upscaler's job. Rejecting a good performance for
  resolution wastes the saving the policy exists to make.
- **Anchors stay full resolution.** Keyframes, scene plates, character sheets
  and prop turnarounds are inputs, not outputs: generate and keep them at full
  size. A first frame also locks the output aspect ratio, so its ratio must be
  right even though the render is small.
- **Aspect ratio is uniform across a scene.** Mixed ratios break both the
  upscale pass and the edit. Lock the ratio at the first keyframe of a scene.
- **Upscale once, at the end.** Upscale approved takes only, after the cut is
  locked — never mid-production, and never a take that may be refired.

## PART 8.1 — PROVIDER RULING, 2026-08-13 (supersedes Part 8's 480p line)

**House route: `minimax/h3/image-to-video` at 768P.** Judged against Seedance
2.5 on the same beat, same keyframe, same prompt content. Julian's verdict:
better result, higher quality, lower cost.

Three consequences, all load-bearing:

**1 · The fire resolution rises from 480p to 768P.** H3 has no 480p tier — its
enum is 768P / 2K / 4K. Part 8's "fire everything at 480p" was written against
Seedance's ladder and no longer applies. 768P is now the cheap tier, and it is
*better* than the policy it replaces. Topaz upscale after picture lock is
unchanged.

**2 · No generated audio, at all.** Seedance could synthesise sound and
lip-synced speech; H3 cannot. Every sound in the finished episode is post:
dialogue from ElevenLabs, effects and ambience laid against picture. This does
not change the placement-marker law — it makes it the only law. A take is never
rejected for having no sound.

**3 · One reference image, permanently, until fal repairs
`reference-to-video`.** Identity cannot arrive from a model pack alongside an
environment plate; it must already be in the frame. Every shot therefore needs
its own keyframe. See `single_reference_law` in the project's script_authority.

**Prompt expansion is forced OFF.** H3 defaults to running a vision model over
the prompt and rewriting it before generation. Left on, no verdict is
attributable — a defect could come from the emission or from a rewrite nobody
saw. `fire.py` sets `enable_prompt_expansion: false` and this is not optional.

**Duration** is an integer 5–15 seconds, so a 12-second beat is expressible.
**Prompt ceiling** is 50,000 characters, far above the 5,000 the standard
assumes — the constraint is now craft, not budget.

## PART 9 — SCENE-LEVEL KEYFRAMES (Julian's ruling, 2026-08-13)

**One keyframe per SCENE, not per beat.** The beats are delivered by the
image-to-video model from the references, the audio and a prompt that carries
the beat — not by drawing every moment by hand.

A new keyframe is warranted only by a genuine **cut**:
- a new room,
- a genuinely new camera setup,
- or a jump in time.

Beats *within* a continuous take are the model's job. That is what it is for.

**Where this went wrong before the ruling.** The single-reference constraint
(one image per generation) is real, and the inference "therefore one keyframe
per shot" is also real — but it was then applied per BEAT, which is a different
and much more expensive thing. Act One's counter scene was broken into three
keyframes when it is one continuous take at one camera position in one room.
Extra keyframes are not wasted, but their role is as END-STATE references to
judge a take against, never as required anchors.

**Every emission is gated before it is fired. No exceptions.**
Through the official Seedance prompt generator and the studio preflight, scoring
**above 9.5**. This holds whichever provider is being fired: the Seedance-specific
syntax (`@Image N` roles) applies only to Seedance routes, but the principles are
provider-agnostic and all still apply — non-numeric stages rather than invented
time ranges, no blanket negatives, an observable end state per stage, every
camera move with a named target, physics rather than adverbs, and no interior
states that cannot be rendered.

**Recorded failure, same day:** the first continuous-take test was fired WITHOUT
being gated, to answer a question quickly. Retro-scored at 9.0 — under the floor
on length (2,553 chars) and on two instances of "he is listening", an interior
state with no visible form. Speed is not a reason to skip the gate; the gate
exists precisely for the moments when there is a reason to hurry.
