<!--
PORTABLE SKILL · works in OpenAI Codex, Claude Code, or any agent that reads
markdown instructions.

Codex install:   copy this file's body into your repo's AGENTS.md (or
                 ~/.codex/AGENTS.md for global use), or reference it from there:
                 "For any Seedance scene work, follow studio/skills/
                 seedance-scene-wrapper/SKILL.md exactly."
Claude install:  drop this folder into .claude/skills/ as-is.
-->

# seedance-scene-wrapper

**Every scene opens with an establishing shot and closes with a button, and each
is its own short generation — never a request buried inside a long one.**

Use this skill whenever breaking a script scene into Seedance 2.5 shots, writing
an establishing/opening/closing/wide/master shot, or planning scene transitions.

---

## The wrapper

| Beat | Job | Length | Coverage |
|---|---|---|---|
| **Opening establish** | where are we, when, what emotional temperature | 3–5s | extreme-wide or wide; static, slow crane, or one gentle drift |
| **Entry / geography** | place the characters inside that world | wide → medium-wide | reveal who is where, relative positions |
| **Dramatic coverage** | the script and the performances | the scene | mediums, closes, reactions, inserts — the director's plan |
| **Exit / button** | the consequence, and the scene's full stop | 3–5s | wide pull-back, rise, hold, or one symbolic close detail |

The button is not an "establishing shot at the end" — it is an **exit shot**: it
shows what the scene *changed* in the wider world, or lands one memorable
emotional image. Resolution (pull back as they walk home), cliffhanger (hold
wide as a small shape moves in the distance), transition (rise and match-cut
into the next location's shape or palette), or emotional button (stay close,
then widen to show them alone in a huge space).

Seedance 2.5 can one-take 30 seconds and even sequence internal cuts, but the
wrapper still generates establish and button as **separate short clips**: a
single long multi-beat generation surrenders control over exactly when the held
frame lands and how continuity chains into the next scene — and the model's own
release notes flag multi-subject interaction stability as its weakest ground.

## The one-job rule

**Give every establishing shot exactly one job, and name it.** A generic aerial
is a postcard, not a shot. The four jobs:

- **Location** — *"misty dawn over the arcade — reveals where we are"*
- **Scale** — *"the tiny figures dwarfed beneath towering clover — reveals the scale of their world"*
- **Threat** — *"the den warm in foreground, a storm gathering behind the hills — foreshadows danger"*
- **Emotion** — *"the empty playground after the friends leave — loneliness after the argument"*

If you cannot write the job in one clause, the shot has no reason to exist.

## Characters are optional — and their absence is DECLARED

A wrapper beat must state one of two things, never neither:

- **Absent:** *"Character-free frame; no characters enter or appear — no
  silhouettes, reflections, shadows, or background figures."* — and the
  character sheets are **excluded from the reference set entirely**, because a
  supplied reference is an invitation to invent someone into the frame.
- **Present:** name only their **screen position, scale, and one quiet action**.
  No performance, no dialogue, no story action in a wrapper beat — those belong
  to coverage.

## Entry geography is a coverage shot, not a fourth role

The engine allows exactly `establish | coverage | button`. Entry/geography is
**`shot_role: coverage`** with `coverage_function: entry_geography`: it may
carry dialogue and performance, it inherits the establisher's screen geography,
and it may use the establisher's held frame as its continuity authority:

```json
{
  "shot_role": "coverage",
  "coverage_function": "entry_geography",
  "frame_source": "chain_cut",
  "chain_from": "scene_07_establish",
  "continuity_requirements": [
    "same dawn light",
    "the arcade doorway remains screen-left",
    "Ivy enters from lower-right"
  ]
}
```

Do not invent an unsupported entry role — the wrapper gates apply only to
`establish` and `button`, and entry coverage is where dialogue becomes legal.

## The laws this inherits (do not relax them)

1. **Wrapper beats carry no dialogue.** Ambience only. If a line must bridge
   into the button, it is laid in the edit, not generated.
2. **One dominant camera action per shot**, then the end frame is **held
   completely stable for the final full second** — that held frame is what the
   edit cuts on and what the next shot may inherit.
3. **Describe the frame, not the location.** An establisher is usually
   `room_scope: full` — the one beat where reciting the geography is correct.
   Coverage and buttons scope down. Anything a prompt names that is not in the
   frame is a gap the model will fill.
4. **Chain the end frame.** The establisher's held final frame is the entry
   shot's **primary continuity reference**. It takes the Image 1 slot only when
   composition continuity outranks the approved scene plate (`chain_continue`,
   or a `chain_cut` where prop/light state must carry); otherwise the scene
   plate stays Image 1 — a new scene's first duty is to re-establish its
   designed location, lighting and architecture. The button's held frame is the
   *next scene's* transition authority under the same rule.
5. **References are roled AND ordered**, and the order is conditional:

   ```
   If frame_source is chain_cut or chain_continue:
     Image 1 = predecessor's held end frame  (continuity — and composition
               authority only on chain_continue)
     Image 2 = approved scene plate          (location appearance only)
   Else:
     Image 1 = approved scene plate          (location authority)
   Image N+ = character identity sheets      (excluded on a character-free frame)
   Audio    = never attached to an establish or button generation
   ```

   Each reference states what it must NOT contribute. The wording must make the
   authority hierarchy unmistakable — a scene plate listed first will otherwise
   be privileged over the actual predecessor composition.
6. **Trim 6–12 frames of breathing room** on the establish and the button at
   the edit; generations drift at their edges.

## The scene plan block

Produce this per scene before any prompt is written:

```
SCENE [n] — [title]
Purpose:         [what changes, emotionally or narratively]
Location/time:   [place, time, weather, atmosphere]
Continuity in:   [what must match the previous scene's button]
Continuity out:  [the exact held composition the button hands onward]

OPENING ESTABLISH (3–5s) — job: [location | scale | threat | emotion]: [one clause]
  Frame: [foreground / midground / background]. Camera: [one action].
  Characters: [where, if visible — small, unnamed action].
  End frame: [precise composition, HELD one second].

COVERAGE — [the director's shot list; this skill does not write it]

EXIT BUTTON (3–5s) — the frame now shows: [the consequence]
  Camera: [pull back | rise | hold | pan — one only].
  End frame: [precise held composition → next scene].
```

## The Seedance 2.5 prompt pattern

Wrapper beats are generated as **separate short clips**. Non-negotiables first,
prose not fragments, one camera action, an explicit end state.

**The reference-authority lines are COMPILED from `frame_source`, never pasted
as a static block** — a generic "@Image 1 is the location authority" is wrong
the moment a chained end frame takes the first slot, and references telling the
model competing stories is one of the highest-leverage failure modes in AI
video:

```
16:9 animated cinematic shot.

[IF frame_source = keyframe]
@Image 1 is the start-frame and composition authority. Begin by reproducing
its exact camera framing, character placement, prop placement, lighting state,
and spatial layout. Preserve these facts at the first frame; perform only the
declared camera action afterward. Do not reinterpret, redesign, or introduce
off-frame elements from this reference.

[IF frame_source = scene_plate]
@Image 1 is the location authority. Take its architecture, layout, palette,
and motivated lighting only. Do not copy any incidental framing, character
pose, or action from it.

[IF frame_source = chain_cut]
@Image 1 is the continuity authority. Preserve its relevant props, character
state, lighting state, and spatial relationships, but compose a new shot.
@Image 2 is the location appearance authority. Take its architecture, material,
palette, and lighting design only; do not copy its framing, character
placement, or action.
Sacred continuity facts, preserved exactly: [continuity_requirements].
Everything not named may be freely recomposed.

[IF frame_source = chain_continue]
@Image 1 is the continuity and composition authority. Begin from its held
composition and preserve camera direction, spatial layout, props, character
state, and lighting state.
@Image 2 is the location appearance authority only. Do not take framing,
character placement, pose, action, or a camera direction from it.

[IF (frame_source = scene_plate OR frame_source = keyframe) AND characters_visible]
@Image 2..N define character identity only: preserve design, proportions,
costume, and key markings. Do not take pose, framing, acting, or composition
from these references.
[IF (frame_source = chain_cut OR frame_source = chain_continue) AND characters_visible]
@Image 3..N define character identity only: preserve design, proportions,
costume, and key markings. Do not take pose, framing, acting, or composition
from these references.
[IF characters_visible = false]
No character references are attached. Character-free frame; no characters
enter or appear — no silhouettes, reflections, shadows, or background figures.

[ESTABLISH] Extreme-wide view of LOCATION at TIME: foreground ELEMENT, midground
ENVIRONMENT, distant LANDMARK. [Character blocking, if visible.] The camera
makes one slow MOVEMENT to reveal THE JOB. Ambient sound only: <...>. No music
unless diegetic. The shot ends on COMPOSITION, held completely stable for the
final second.
```

For the button, swap the closing block for: *"The wider frame now shows
CONSEQUENCE. The camera slowly ACTION, then holds on COMPOSITION for the final
second. No new dialogue."*

The four sources, and what keeps the wrapper stable across scenes without
every generation becoming an uncontrolled continuation of the last:

- **`scene_plate`** — design the first composition from an approved location
  source. The normal source for a fresh establishing shot.
- **`keyframe`** — reproduce an explicitly approved opening composition (a
  prior generated still, a storyboard frame, a previous shot's first frame).
- **`chain_cut`** — inherit the important world state but compose a new shot.
- **`chain_continue`** — begin from the inherited image and continue its
  composition and camera logic. **The character-reference start index is computed, never
pasted** — it is `1 + (2 if chained else 1)` — because a sheet claiming a slot
another reference already declared is two references telling the model
competing stories.

## Keyframe grounding — what the model actually does with anchors

Verified against Seedance 2.5's documented frame-anchoring behaviour:

- A **first frame is required** for image-to-video; a last frame alone is
  rejected — the model needs a defined starting point.
- **First + last frame together produce interpolation** between the two
  states, not free generation. Never attach a last frame to a wrapper beat
  unless interpolation IS the intent — and the two frames need **identical
  dimensions**, or the last frame stretches.
- **Aspect ratio is a locked parameter** on first-frame work (locked to the
  first frame) and on edits/extensions (locked to the source). Never fight a
  locked parameter in the prose prompt — match the asset and set the request.
- **Multi-keyframe sequences** are an ordered list the prompt must declare as
  sequential ("Use @Image 1 through @Image N as keyframes in this order").
- Anchors are **named individually** — a combined "these two are the first and
  last frames" does not reliably bind either one.
- **Keyframes outrank storyboards for moment control**: separate keyframe
  images give strictly closer visual alignment; a multi-panel storyboard grid
  guides plot at a high level and is not a frame-by-frame control surface.

This is why `keyframe` is a structurally distinct request type, not an
alternative spelling of "reference image" — and why gate `K` refuses the
underspecified form.

## The ensemble manifest — multi-character keyframes

Headcount is not the risk; **an unbound subject is**. ByteDance's own flagship
examples bind eighteen subjects one-to-one (@Image 5 strictly the lead
vocalist, @Images 11–14 the choir), and every documented drift type — identity,
costume, performance, spatial — traces back to unmanaged binding, never to the
number of characters.

The operating rule: **`keyframe` remains fully valid for complex ensemble
shots, provided every visible character is individually bound** — one
reference, one screen zone, one declared pose, and any composition-critical
contact or occlusion named explicitly:

```json
"ensemble_manifest": [
  { "character": "tom",  "screen_zone": "left third",
    "pose": "standing, bundle held at chest" },
  { "character": "rich", "screen_zone": "right third",
    "pose": "one hand resting on the counter",
    "contact": "none — the counter stays between them" }
]
```

Gate `K` refuses a keyframe wrapper with two or more visible characters and no
complete manifest. **If the manifest cannot be built yet** — positions, poses,
or contact points not yet decided by the director — **fall back to
`scene_plate` or `chain_cut`**: not because the model cannot do ensemble
keyframes, but because an underspecified manifest is the documented failure
driver. The compiler emits one binding line per entry and closes the set:
*"No character leaves their named zone, and no contact occurs beyond what is
named above."*

Reference discipline holds below any platform ceiling — and it is now
**official provider guidance**, not just practitioner lore: 1–8 image-led
subjects is the stated stable range (9–12 is a stretch that expects retries),
and the binding rule is the provider's own words — *"do not place the only
mapping information inside the reference image; bind every asset explicitly
in the written prompt; for several subjects, list each character-to-image and
character-to-audio relationship separately."* Start under eight references and
add one only after naming the specific missing fact it fixes — fifty
inconsistent images are fifty versions of the same problem. Above five
subjects prefer single-view references, and when multiple angles are needed
upload **separate images per angle**, never a combined sheet. For groups,
establish individuals in earlier shots and keep group action modest; a crowd
is a few grouped composite references, not many singles.

## The near-miss rule

A wrapper beat that is 90% right is not regenerated. Seedance 2.5's
region-level and timestamp-level editing can redraw a prop, fix a costume
detail, or retime a range while preserving the approved composition — verify
five seconds either side of the edit for flicker or contamination. Full
regeneration is for composition failures, not detail failures.

## The wrapper-density gate

An establish or button prompt is **refused** (gate `G · WRAPPER_OVERLOADED`) if
it contains any of:

- spoken dialogue, quoted speech, or an attached dialogue audio source
- more than one camera-movement verb
- more than one meaningful character action
- more than one intended narrative reveal
- no explicit end-frame description
- no one-second stable hold
- a character or prop named in the prompt but absent from the declared frame
- characters marked visible with no blocking stated

The camera-verb and hold checks run on the **structured fields**
(`camera_action`, `end_hold_seconds`), not on compiled prose — prose-only
detection mistakes "pull back and hold" for two movements, and a hold is
validated as a number, never by hunting for wording.

This gate protects the whole system from a director — or an agent — gradually
turning a 4-second visual beat into a miniature scene.

Two companion gates guard the reference set itself:

- **`H · CHAIN_UNDERSPECIFIED`** — refuses a `chain_cut`/`chain_continue` shot
  with no predecessor named, no `continuity_requirements`, or a predecessor
  whose end frame was never held (there is no stable frame to inherit).
- **`I · REFERENCE_AUTHORITY_CONFLICT`** — refuses character sheets attached to
  a declared character-free frame. The authority *wording* cannot conflict —
  it is compiled from `frame_source` — so this gate polices the one thing that
  still can: the attachment list.
- **`K · KEYFRAME_UNDERSPECIFIED`** — refuses `frame_source: keyframe` on a
  wrapper unless `keyframe_id` names the approved start frame AND
  `continuity_requirements` says which first-frame facts are immutable — and,
  with two or more visible characters, unless an `ensemble_manifest` binds
  every one of them to a screen zone and a declared pose (the refusal names
  the fallback: `scene_plate` or `chain_cut`). This keeps "keyframe" meaning
  *exact reconstruction of an approved composition* — never an ambiguous
  alternative spelling for "reference image":

  ```json
  { "frame_source": "keyframe",
    "keyframe_id": "scene_07_establish_comp_v03",
    "continuity_requirements": [
      "den centred in lower third",
      "storm bank fills upper half",
      "Ivy remains at lower-right",
      "blue pre-dawn lighting" ] }
  ```

- **`J · WRAPPER_DURATION_INVALID`** — refuses an establish or button outside
  3–5 seconds. Longer is a scene wearing a wrapper's clothes; shorter cannot
  hold its end frame. Rare exceptions go through an explicit override with a
  written reason, never through drift:

  ```json
  { "duration_seconds": 6,
    "wrapper_duration_override": {
      "approved": true,
      "reason": "Slow dawn reveal required to land a music transition." } }
  ```

## The wrapper shot schema

```json
{
  "shot_role": "establish",
  "duration_seconds": 4,
  "establish_job": "threat",
  "camera_action": "slow crane down",
  "frame_source": "scene_plate",
  "characters_visible": true,
  "character_blocking": "Ivy appears small at lower-right, walking toward the den",
  "end_frame": "Wide den centred in lower third; storm bank occupies upper half; Ivy at lower-right",
  "end_hold_seconds": 1,
  "edit_handle_frames": { "head": 8, "tail": 10 }
}
```

**When `frame_source` is `chain_cut` or `chain_continue`,
`continuity_requirements` is REQUIRED** — at least one item. "Preserve
continuity" is too broad: the system must know which visual facts are sacred
and which it is free to redesign. Validation:

```
If frame_source is chain_cut or chain_continue:
  require chain_from (the predecessor shot)
  require continuity_requirements with at least one item
  require the predecessor's end_hold_seconds >= 1   (no held frame, nothing to inherit)

If frame_source is keyframe:
  require keyframe_id
  require continuity_requirements with at least one item
  if two or more characters are visible:
    require ensemble_manifest binding EVERY visible character to one
    reference, one screen_zone and one declared pose (contact named
    explicitly where composition-critical)
```

The same rule binds a keyframe wrapper — gate `K` enforces it. A complete
keyframe establish, so the contract cannot be misread:

```json
{
  "shot_role": "establish",
  "duration_seconds": 4,
  "establish_job": "threat",
  "camera_action": "slow crane down",
  "frame_source": "keyframe",
  "keyframe_id": "scene_07_establish_comp_v03",
  "continuity_requirements": [
    "den centred in the lower third",
    "storm bank fills the upper half",
    "Ivy remains at lower-right",
    "blue pre-dawn lighting"
  ],
  "characters_visible": true,
  "character_blocking": "Ivy remains small at lower-right, then walks toward the den",
  "end_frame": "The den remains centred in lower third beneath the storm bank; Ivy is at lower-right",
  "end_hold_seconds": 1,
  "edit_handle_frames": { "head": 8, "tail": 10 }
}
```

```json
{
  "shot_role": "button",
  "duration_seconds": 4,
  "button_change": "the cosy den is now dark and empty after the group leaves",
  "camera_action": "slow pull-back",
  "frame_source": "chain_cut",
  "chain_from": "coverage_04",
  "continuity_requirements": [
    "den remains dark",
    "lantern remains at upper-left distance",
    "wet grass and blue moonlight continue",
    "no characters visible"
  ],
  "characters_visible": false,
  "end_frame": "the dark den small at centre, framed by tall grass; a distant moving lantern at upper-left",
  "end_hold_seconds": 1,
  "handoff_to_scene": 8
}
```

Dialogue and audio policy are not fields — they are consequences: a wrapper
beat's speaker is stripped by the compiler and refused by the gate.

## In this studio's engine

`shots.shot_role` = `establish | coverage | button`, with `establish_job` and
`button_change`. The compiler (`studio/domain.py::compile_prompt`) enforces the
no-dialogue rule and the held end frame automatically; the gates and audit loop
apply to wrapper beats exactly as to coverage. Chain the entry shot from the
establisher with `frame_source: chain_cut` (or `chain_continue` if the camera
holds).

## The contract

```
Scene plate
  → Opening establish   silent, 3–5s, one visual job, one move, held end frame
  → Entry geography     coverage role, maps characters into the established world
  → Dramatic coverage   director-led dialogue and performance
  → Exit button         silent, 3–5s, visible consequence, one move, held end frame
  → Next scene
```

Every handoff has an owner, every reference has a role, dialogue stays confined
to performance coverage, and every wrapper clip exits on a stable editorial
frame.

