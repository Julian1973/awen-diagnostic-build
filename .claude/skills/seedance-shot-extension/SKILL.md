---
name: seedance-shot-extension
description: "Direct and extend approved Seedance 2.5 clips into multi-shot sequences while preserving character identity, scale, scene geography, audiovisual continuity, exact dialogue, performance and editorial handoffs. An extension is a playable continuation of approved footage, never a fresh imitation: delta-only prompting with already-true facts, 2-3 identity anchors, lighting and sound state carried as literal text, an engineered landing frame with a living hold, and every bridge declaring one sole geography master. Use when extending a clip forward or backward, chaining segments past 30 seconds, bridging two approved clips, or repairing a failed continuation. Sibling of seedance-scene-wrapper, which owns scene grammar and held-frame chaining."
---

# seedance-shot-extension

**Create a playable continuation of approved footage, not a fresh imitation.**
Every extension advances one dramatic beat, preserves inherited audiovisual
state, and finishes on a deliberate handoff image. An extension treats the
prior clip as ground truth and carries only the delta — anything the prompt
re-describes, the model will re-perform.

Use whenever generating the next segment of a multi-shot Seedance 2.5
sequence: forward extension, backward extension, or a bridge between two
approved clips.

---

## Verified capabilities (OFFICIAL)

Seedance 2.5 generates up to 30 seconds per pass; supports multi-round
extension; can organise several logically connected shots within one
generation; accepts up to 30 images, 10 videos and 10 audio clips per pass;
supports timestamp-led generation and targeted editing; and takes character,
scene, prop, motion, camera, clay-render and audio references.

**Platform discipline:** buttons, mode names, resolution tiers, extension
limits, seeds, reference-strength sliders and API fields are *provider
settings*. Never present one as universal unless visible in the selected
interface or verified in its current documentation. Record a seed only when
the interface exposes it — never invent one.

## Choose the correct operation first

| Need | Operation |
|---|---|
| First approved scene material | Base generation |
| One beat containing connected camera angles | Native multi-shot generation |
| Append new story material to an approved clip | **Forward extension** (this skill) |
| New material leading into an existing clip | **Backward extension** (this skill) |
| Connect two approved clips | **Bridge** (this skill) |
| Change a local section, keep surroundings | Targeted edit — the near-miss rule |
| Repair a failed continuation | Re-extend from the last clean approved master |

**Never extend an unapproved or drifting source clip.** The master becomes
the continuity authority for everything after it — gate `L` refuses an
unapproved source. And know the second lane: on routes with no video-extend
capability (image-composing reference-to-video routes), continuation runs on
**held-frame chaining** (`frame_source: chain_cut / chain_continue`, gate
`H`, wrapper skill). The route's capability chooses the lane, never habit.

## Source priority

1. Approved dialogue audio and exact approved script dialogue
2. The approved master video being extended
3. Original approved character, location, prop and style references
4. Current show bible and locked canon
5. The recorded closing state of the preceding beat
6. Director and cinematography choices

Never silently change dialogue, speaker, identity, scale, costume, wearable
state, prop state, geography, screen direction or story outcome.

## Non-negotiable principles

1. **Extend the approved video.** The actual clip is the continuity master;
   preserve its interface tag exactly (`@Video1`). The compiler asserts the
   continuation explicitly: *"Extend the video forward from @Video1. Begin
   as a direct audiovisual continuation of its ending. Preserve inherited
   motion, performance, composition, character state, screen direction,
   lighting, geography, music, ambience and sound state. Do not reset the
   scene."* Control comes from this explicit continuation language and
   clear asset roles. (An earlier field claim that the word "reference"
   near the tag causes lookalike generation is UNVERIFIED — the compiler
   uses the bare tag regardless, and the explicit language does the work.)
2. **The extracted final frame is QA by default.** Use it to inspect and
   record the handoff — never automatically attach it as a competing
   opening authority. If an interface demonstrably benefits from it, scope
   it narrowly: *"@Image1 confirms only the inherited closing composition
   of @Video1. It does not replace @Video1 as motion, performance or
   audiovisual authority."* Never attach a frame that disagrees with the
   uploaded ending.
3. **Trim to the last clean point, keep a real handle.** If the master
   contains failed material after the desired handoff, trim it — but retain
   enough preceding action and audio to establish motion, performance,
   camera direction and sound continuity. There is **no universal
   15-second trim rule** — that number belongs to R2V *motion references*,
   a different lane.
4. **One generation equals one dramatic beat.** One to three shots forming
   a miniature story: setup → development → payoff. Split for a major
   location change, time jump, incompatible state, long dialogue exchange
   or excessive action. 30 seconds is a ceiling, not a target — for
   reference-sensitive recurring animation, 6–15 seconds is often safer.
5. **Describe the delta.** State what is already true, then direct only
   what happens next. Never replay or reverse completed action to explain
   continuity.
6. **2–3 identity anchors, restated only at risk points** — occlusion,
   exit/re-entry, transformation, fast action, major angle change. Restate
   only the decisive identity and spatial facts; over-specifying invites
   contradictions.
7. **Reuse original canon references.** The video controls inherited
   footage; original approved references control identity, scale, wardrobe,
   props and geography. Never promote a drifted generated frame to identity
   authority. For an ensemble, attach the approved reference for every
   prominent visible character.
8. **Carry lighting and sound state as literal text.** Lighting is what
   slips on chains; inherited music and ambience must be declared to
   continue, develop, resolve or stop — never left to memory.
9. **Engineer the landing frame.** Camera scale and height, positions,
   screen direction, gaze, expression, prop state, action phase, dominant
   light, and negative space for the next beat — then a brief living hold
   (breathing, ambient motion) without freezing or new action.
10. **A bridge declares one sole geography master.** Bridges and backward
    extensions are the highest-risk case for props and characters landing
    in the wrong place. Reject a technically smooth bridge that changes
    story logic, identity or geography.
11. **Budget one grading pass across any chained sequence.**

## Preflight workflow

1. **Confirm the master** — the exact approved clip whose ending continues.
2. **Build the beat map** — dramatic purpose; whose experience leads; what
   changes; setup/development/payoff; cuts vs continuous reframing; the
   exact final image required next.
3. **Create the reference contract** — one job per asset, hierarchy
   declared, interface tags preserved exactly:

   | Asset role | Controls |
   |---|---|
   | Master video | inherited motion, performance, composition, editing rhythm, light and sound state |
   | Character identity | canonical design, proportions, scale, clothing, accessories — not pose or background |
   | Location | geography, landmarks, materials, palette — not character identity |
   | Prop | exact design and current state |
   | Audio | speaker, exact words, cadence, delivery, timing, mouth timing, silence |
   | Style | rendering language and material finish only |
   | Clay render / blocking | camera path, pose, trajectory, spatial structure only |
   | Closing target | required landing composition only |

4. **Record the opening-state ledger** — positions, facing, screen
   direction; pose, gaze, expression, action phase; relative scale and
   depth order; costume/wearable/prop/state changes; camera size, height,
   axis and movement at the join; landmarks and locked geography; dominant
   light and time of day; speaker, listener state, music, ambience, active
   sound; **completed actions that must not repeat**.
5. **Select the platform operation** — an explicit Extend/Continue
   operation over automatic classification, kept outside the creative
   prompt as provider data.

## The extension block schema (this studio's engine)

```json
{
  "extension": {
    "mode": "forward",
    "source_clip": "S8_take3",
    "source_approved": true,
    "task_type": "extend",
    "already_true": [
      "the door is already closed — do not repeat the closing motion",
      "Tom holds the bundle in both hands",
      "soot on Richard's apron accumulates and never resets"
    ],
    "identity_anchors": ["rust-red crewneck jumper", "grey checked collar"],
    "lighting": "warm amber lamplight from screen-left, soft quality, gentle shadow edges.",
    "audio_state": "shop room tone continues; the music box remains silent."
  }
}
```

For a bridge: `"mode": "bridge"`, `"geography_master": "@Video1"`. State
facts (soot, wetness, damage) live in `already_true` with their own carry
rule ("accumulates and never resets"); identity anchors never change.

## Paste-ready prompt architecture

Use only the relevant sections; keep direction filmable and economical.

```text
FORMAT
[Duration, aspect ratio, locked visual treatment.]

EXTENSION AUTHORITY
Extend the video forward from @Video1.
Begin as a direct audiovisual continuation of the ending of @Video1.
Preserve inherited motion, performance, composition, character state,
screen direction, lighting, geography, music, ambience and sound state.
Do not reset the scene.

ALREADY TRUE
[Completed actions and current observable state.]
These facts are established. Continue without replaying them.

REFERENCE CONTRACT
[@Video1 = inherited audiovisual continuity.]
[@Image… = one precise canon role per asset.]
[@Audio1 = exact approved performance authority.]

AUDIO AUTHORITY
[On a recorded-dialogue route: @Audio1 is the sole authority for speaker,
exact words, cadence, delivery, timing, mouth timing and silence. Only the
active speaker moves their mouth; listeners stay naturally closed-mouth
with silent physical reactions. No narration, improvised words, extra
voices, subtitles or text overlays.]
[How inherited music and ambience continue or change.]

OPENING SPATIAL STATE
[Concise positions, depth order, eyelines, screen direction for every
character or prop that matters.]

NEW DRAMATIC BEAT
[The change this extension delivers, and whose experience leads it.]

Shot 1: [shot size, useful focal length if needed, camera behaviour].
[Sequential action — one verb per subject, bound with while/then.]
[CHARACTER: exact dialogue where spoken, per the route's dialogue rule.]

Cut to.

Shot 2: [consequence, reaction or changed point of view; keep the
established axis unless the camera visibly crosses it.]

CONTINUITY SAFEGUARDS
[Only likely, material risks: wrong speaker, identity swap, duplicate
character, lost prop, wrong scale, repeated action, broken eyeline.]

LANDING FRAME
[Exact camera, composition, positions, gaze, expression, action phase,
prop state, light, next-beat negative space.]
Settle into a brief living hold without freezing or introducing new action.
```

Omit `Cut to.` for a continuous take — describe the motivated occlusion,
pan, track, orbit, rack focus or reframing instead. Use timestamps only
when approved audio timing is known or precise timing materially improves
control; make ranges contiguous. **Never invent timing to look technical.**

## Camera and editing rules

- Every cut reveals consequence, changes point of view, lands a joke,
  clarifies geography or catches a reaction — no other cuts.
- Preserve the 180-degree axis unless the camera visibly crosses it or a
  neutral shot re-establishes geography.
- Carry movement across cuts: travel direction, gaze, limb phase and action
  energy stay coherent unless reversal is intentional.
- Tie camera movement to a triggering action and a subject.
- A lens only when it creates a useful, nameable result.
- Duration must fund every link of the action chain — the common failure is
  the clip running out one action short.

## Ensemble continuity

After every risk point, restate only the decisive identity and spatial
facts. For sensitive recurring ensembles (the Crystal Bears pattern):
exactly one of every scripted character and no unscripted additions;
similar-species characters bound to separate references, never
interchangeable; approved relative heights, proportions and age coding
preserved; hover height and depth stated for small flying characters;
wristbands, crystals, glasses and handheld props tracked as state; the
active speaker named and listeners closed-mouth; drift corrected from
original approved turnarounds, never a drifted generation.

## Audio continuity

The video carries inherited sound; approved audio controls the new exact
performance. Decide explicitly: whether music continues, develops, resolves
or stops; whether ambience remains seamless; which sound motivates a cut or
reaction; who speaks and who stays silent; whether the join has audio
handle; whether the landing sound can open the next extension. Do not
invent vocalisations, humming, exertion, laughter, effects or music.

## Gate L · EXTENSION_UNDERSPECIFIED (this studio's engine)

The engine **refuses** an extension when any of these hold:

- no `source_clip` named
- source clip **not marked approved** — never extend a drifting master
- no `already_true` facts — completed actions will replay at the cut
- no `identity_anchors`, or more than 3 — over-specifying invites
  contradictions
- `mode: bridge` with no `geography_master`
- `task_type` not pinned to `extend`
- unknown mode (anything but forward / backward / bridge)

## QA after every generation — approve only when ALL pass

- **Join**: opening continues the master, no reset or replay; motion,
  camera direction, light and sound cross naturally; nothing duplicated.
- **Story**: the beat is clear; every shot has a distinct purpose; cuts are
  motivated; action and dialogue fit the duration.
- **Identity & scale**: every character matches original references;
  heights, proportions, wardrobe, prop state correct; nobody duplicated,
  fused, stretched or replaced.
- **Geography & performance**: screen direction, eyelines, depth and
  landmarks coherent; action causal; reactions follow their trigger.
- **Dialogue & sound**: exact words, correct speaker, mouth timing per the
  route's rule; only the active speaker mouths; music/ambience/silence as
  directed.
- **Handoff**: final state matches the landing frame; no unplanned action
  in the hold; closing picture and sound can open the next extension.

**Reject and repair at the first failed gate** — never accept a compromised
clip and compound the error.

## Failure recovery

| Symptom | Correct response |
|---|---|
| Opening resets or repeats | Shorten ALREADY TRUE; direct only the delta; verify the master and the Extend operation |
| Resembles but does not continue | Strengthen audiovisual-continuation language; remove competing opening authorities |
| Identity or proportions drift | Re-extend from the last clean master with ORIGINAL character authority |
| Characters swap or duplicate | Separate role and position per character; add a one-of-each safeguard |
| Small character changes scale/depth | State size, hover height, depth and nearest comparison character |
| Geography flips | Restate direction, axis, landmarks, depth; neutral re-establishing shot if needed |
| Cut feels random | Make it reveal consequence, reaction or new information |
| Listeners mouth dialogue | Restate audio authority, active speaker and closed-mouth listeners beside the line |
| Prop or wearable resets | Add it to ALREADY TRUE, the ledger, and its reference role |
| Lighting or sound jumps | State inherited source/state, then only the motivated change |
| Master already contains drift | Do not extend it — return to the last clean clip or repair first |

## Prompt quality gate

Score internally 0–2: exact story beat; canon and references; physical
staging; motivated camera and editing; observable performance; spatial
composition; motivated production detail; exact dialogue and audio; opening
and closing continuity; prompt economy. **Revise below 17/20; story, canon,
dialogue/audio and continuity may never score zero.** Strip generic claims
("cinematic", "magical", "premium") unless the surrounding direction makes
the result visible and filmable.

## Required production record

For every approved extension: scene and clip ID; dramatic beat and
duration; master-video asset ID; reference contract; exact dialogue and
audio mapping; opening-state ledger; the paste-ready prompt; safeguards;
selected version; QA result; closing state and next-clip anchor; provider
settings when known. **The record — not memory — is the source for the next
extension.**

## Official foundation

- ByteDance Seed, "One-take Creation, Flexible Referencing: Introducing
  Seedance 2.5", 31 July 2026 —
  https://seed.bytedance.com/en/blog/one-take-creation-flexible-referencing-introducing-seedance-2-5
- ByteDance Seed, Seedance 2.5 model page —
  https://seed.bytedance.com/en/seedance2_5
