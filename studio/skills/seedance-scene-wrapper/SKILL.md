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

[IF characters_visible]
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

`frame_source: scene_plate` names a location plate composing a fresh shot;
`keyframe` is reserved for a literal generated first frame that must be
reproduced exactly.

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

## The wrapper shot schema

```json
{
  "shot_role": "establish",
  "duration_seconds": 4,
  "establish_job": "threat",
  "camera_action": "slow crane down",
  "frame_source": "keyframe",
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
Scene Plate → Establish → Entry Coverage → Dramatic Coverage → Button → Next Scene
```

Every handoff has an owner, every reference has a role, dialogue stays confined
to performance coverage, and every wrapper clip exits on a stable editorial
frame.

