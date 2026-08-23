---
name: seedance-scene-wrapper
description: "The scene wrapper for Seedance 2.5 — every scene opens on an establishing shot with ONE declared job (location, scale, threat or emotion) and closes on an exit button that shows the consequence and holds its final frame for the next scene. Use when breaking a scene into shots, writing an establishing/opening/closing/wide/master shot, planning scene transitions, or whenever a scene starts on coverage with no orientation. Wrapper beats are separate short generations, carry no dialogue, and chain their held end frames."
---

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
   shot's Image 1 (continuity on a cut, composition on a hold). The button's
   held frame is the *next scene's* transition authority.
5. **References are roled**: the scene plate is the location authority, the
   character sheets are identity only, the previous end frame is continuity —
   and each states what it must NOT contribute.
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
prose not fragments, one camera action, an explicit end state:

```
16:9 animated cinematic shot. @Image 1 is the location authority — take the
architecture, layout and light from it and nothing else. @Image 2..N define the
characters' appearance only; do not let them change the composition.

[ESTABLISH] Extreme-wide view of LOCATION at TIME: foreground ELEMENT, midground
ENVIRONMENT, distant LANDMARK. CHARACTERS appear small at POSITION, doing one
quiet legible action. The camera makes one slow MOVEMENT to reveal THE JOB.
Ambient sound only: <...>. No music unless diegetic. The shot ends on
COMPOSITION, held completely stable for the final second.
```

For the button, swap the middle for: *"The wider frame now shows CONSEQUENCE.
The camera slowly ACTION, then holds on COMPOSITION for the final second. No
new dialogue."*

## In this studio's engine

`shots.shot_role` = `establish | coverage | button`, with `establish_job` and
`button_change`. The compiler (`studio/domain.py::compile_prompt`) enforces the
no-dialogue rule and the held end frame automatically; the gates and audit loop
apply to wrapper beats exactly as to coverage. Chain the entry shot from the
establisher with `frame_source: chain_cut` (or `chain_continue` if the camera
holds).
