---
name: thistlewood-shot
description: "The Thistlewood's shot pipeline — the approved end-to-end process for turning one beat of a script into a finished animated shot with dialogue. Use for ANY Thistlewood's production work: breaking a scene into shots, writing a keyframe prompt for Julian to generate, compiling and auditing an animation prompt, firing on minimax, driving the mouth from an ElevenLabs recording, assembling sound, cutting a sequence. Triggers on 'next shot', 'do FR02', 'break down scene 2', 'keyframe prompt', 'fire it', 'run the pipeline', 'the shop', 'the front room', 'Richard', 'Tom Chen', 'Macsen', 'the music box', or any Episode 1 / The Wrong Tune work. Every law in this file was paid for by a rejected take — follow it exactly and do not improvise around it."
---

# The Thistlewood's shot pipeline

Proved on FR01, approved 2026-08-14 (POS-002). **Nothing in this file is a
preference.** Every rule names the take it cost.

## The chain, in order

```
script → scene → shots → keyframe prompt → JULIAN GENERATES THE KEYFRAME
       → animation prompt → Seedance audit ≥9.5 → brief → fire
       → sync → assemble → cut
```

```bash
python3 engine/shoot.py keyframe --shot FR02      # the prompt Julian generates from
python3 engine/shoot.py compile  --shot FR02      # the animation prompt + machine gate
python3 engine/shoot.py audit    --shot FR02 --pass 9.7
python3 engine/shoot.py brief    --shot FR02      # SHOW THIS BEFORE FIRING
python3 engine/shoot.py fire     --shot FR02
python3 engine/shoot.py sync     --shot FR02
python3 engine/shoot.py assemble --shot FR02
python3 engine/shoot.py cut      --scene FR
```

Work **one beat at a time**. Julian: *"we work through each scene beat by beat."*
A wrong keyframe costs a re-prompt; a wrong keyframe already animated costs a
re-render.

---

## 1 · Julian generates the keyframe. Always.

We write the prompt; he runs it in his own tool with the references. This is the
accuracy gate and it is deliberately his hand on it.

> *Earned: the keyframe this engine generated with nano-banana turned the
> workshop arch into a curtained recess, lost the brass bell over the door, and
> framed too wide. His held every lock.*

He drops it in Drive as `<SHOT>.png`; fetch by file id with
`https://drive.google.com/uc?export=download&id=…` and save to
`production/keyframes/`.

**A keyframe prompt describes ONE FROZEN MOMENT.** No motion verbs, no "then",
no "as he speaks". Everything is a state: who stands where, holding what, facing
which way, wearing what, with what on their face. A prompt that describes a
change gets the change drawn as a blur, or gets the end of it — and the shot
starts in the wrong place.

---

## 2 · The animation prompt is Seedance 2.5's Core Prompt Formula, in prose

Subject and action → scene → secondary life → performance → mouths → visual
style → camera → audio → `[Maintain Consistency]`.

**Do not invent section labels.** The only bracketed labels that exist are the
guide's own: `[Characters]` `[Props]` `[Scenes]` `[Motion and Audio]` for
multi-reference, `[Generation Goal]` `[Stage N]` `[Maintain Consistency]` for
staged video. One keyframe driving one continuous beat is the **core formula**,
which is prose.

> *Earned: a compiler that emitted `[First Frame]`, `[Subject and Action]`,
> `[Camera]`, `[Performance]`, `[Secondary Life]`, `[Speech]`, `[Physics]` —
> none of which appear anywhere in the guide. Julian: "why arent you using the
> real prompt strucure this is awful why are you straying all the tiem".*

The gate refuses each invented label by name.

---

## 3 · No dialogue words in the prompt, ever

The scripted line does not go in the prompt. The mouth is directed only as a
talking rhythm, and the prompt says **why**: the articulation is replaced from a
separate recording afterwards, so guessing at words here only fights that pass.

> *Earned twice. H3 generates speech from the prompt and animates the mouth to
> what it invented; our recording then plays over the top and the two can never
> agree. Julian: "nope lipsync out the voice detoriates then there is a part
> that is complately different its a mish mass mess."*

---

## 4 · References: the keyframe leads, the sheets anchor identity

Image 1 is the keyframe, roled as **the complete opening composition** and told
not to be restaged or recomposed. Then each character's appearance sheet, each
told what not to contribute and not to change Image 1. Props bind to Image 1
explicitly.

**Ceiling is 8 images** — the guide's stable range. Appearance sheets always
travel; expression sheets fill the remaining slots, speaker first, because that
is the face the audience is reading.

> *Earned: the prompt named Tom, Richard and Macsen and bound them to nothing,
> on the argument that the keyframe already held identity. The guide's own
> first-frame template pairs the frame with appearance references, and its
> checklist asks outright whether every character and prop is bound to one.
> Audited: 8.7, while the machine gate was reporting 10.00.*

**Order is the contract.** The prompt names Image 1..N by position, so the
compiler and the firing command must walk the same list.

---

## 5 · The audit is a LOOP, not a stamp, and it runs until 9.5

```
compile → generator → score
   ├─ ≥9.5 → record the round, fire
   └─ <9.5 → apply what the generator said → NEW prompt, NEW hash
             → back through the generator → repeat
```

```bash
python3 engine/shoot.py audit --shot FR02 --pass 8.7 --notes "characters bound to nothing"
# correct the prompt …
python3 engine/shoot.py audit --shot FR02 --pass 9.7 --notes "bindings added"
python3 engine/shoot.py audit --shot FR02          # the whole history
```

Every round is recorded against the hash of the text it scored, and **only a
round whose hash matches the current prompt counts** — earlier rounds scored a
different document. `fire` refuses unless the current prompt has a passing round
of its own.

**A correction produces a new prompt that has never been through the generator.**
That is the whole point of the loop: the fix is not the end of the audit, it is
the start of the next round. Keep the history — how a prompt reached 9.7 is worth
as much as the 9.7.

> *Earned twice. First: the prompt was materially rewritten — seven reference
> bindings and a different route — and fired against an audit of the version
> before the change. Julian: "no you should have retested the seedance prompt
> generator before firing." Then, once a single stamp existed, it recorded that
> an audit had happened without forcing the cycle when one failed. Julian: "the
> itterated version goes back trhough the prompt generaotr until we get it over
> 9.5."*
>
> *The loop proved itself the hour it was built: capping the reference set
> reordered FR01's sheets, which changed its prompt, which invalidated its 9.7
> and blocked the fire until round 2 was run.*

---

## 6 · Show the brief before firing

`brief` writes `production/briefs/CURRENT.html`, published to a stable artifact
URL and redeployed per shot. It shows the route, the duration, every image in
order, the audio and where it goes, the speaker box, the sound bed, the chain
link, the audit state and **the prompt in full**.

Both `brief` and `fire` **compile fresh** and never read the prompt off disk.

> *Earned: the first brief displayed `emissions/FR02.txt`, which was still a
> multi-reference emission from an earlier grammar — dialogue in braces,
> characters bound to Image N. It scored −9.5 against the current gate and would
> have been fired.*

---

## 7 · The speaker law reaches into the sync stage

The sync service takes a video and an audio file, finds a face and animates it.
**It never sees the prompt, and no route on fal accepts a face selector.** On a
multi-face frame it picks whichever it likes.

So a shot with more than one face declares `speaker_box: [x, y, w, h]` — the
region containing the speaker and nobody else, in the 1344×768 take. The stage
crops it, upscales ×2 so the face is big enough for the model, syncs, scales
back, and overlays at the same coordinates. Only the mouth changed inside that
rectangle, so everything around it lands on identical pixels.

> *Earned: FR01 synced Tom's line onto Richard's face. The speaker law was in the
> prompt and in the gate, and neither could reach the stage where it broke.*

---

## 8 · Direct the face, not just the body and the voice

`[Secondary Life]` directs bodies, the delivery note directs voices, the speaker
law directs mouths — and an undirected **expression** gets filled in with the
average of every warm shop the model has ever seen, which is *pleasant*.

Every shot carries a `faces` map, and where the beat needs it, the words **not
smiling**.

> *Earned: Tom smiling through three consecutive shots about his grandmother's
> broken heirloom, and Richard's "faintest dry amusement" rendered as a grin.
> (NEG-002)*

---

## 9 · Chain-linking has two modes and they are different jobs

- **`continue`** — the camera holds. The previous take's last frame *is* this
  first frame.
- **`cut`** — the camera moves. That frame travels as a **continuity reference
  only**: prop state, lamp state, who is holding what. Never framing.

Before the previous shot is animated, use its **keyframe** instead.

---

## 10 · Approval does not survive a set change

An approved take is exempt from *re-firing*. It is never exempt from *canon*.
When a plate, lock, sheet or script line changes, every approved asset
downstream of it is provisional again.

> *Earned: FR07 was approved, marked `skip`, and so was the one shot nobody
> rebuilt when the room changed — because it was the one shot everybody trusted.
> Sixteen individual reviews missed it; one contact sheet caught it in four
> seconds. (NEG-003)*

**Review the whole scene on one contact sheet, not shot by shot.**

---

## The clock and the sound

- Duration **5–15s**. Below five the route refuses; shorter beats are shot at
  five and trimmed with `cut_to`. Length is measured off the recorded line plus
  handles, never guessed.
- The route's generated audio **never reaches the cut**. The ElevenLabs v3
  recording is the only voice in the film.
- Room tone loops from `room_bed_120s.mp3` — the raw 8s tone repeats audibly
  under any shot longer than eight seconds, and `-shortest` will let it cut the
  *picture* to fit. State the length; never infer it.
- The music box is **synthesised, not generated** (`engine/musicbox.py`), because
  Albert says out loud that the same notes are wrong every time and a generative
  model cannot promise that. The fault is a table: every E 88 cents flat, every D
  34 cents flat.

## The canon that outranks everything here

`projects/thistlewood/canon/` — script v3.1 is the authority, then the
manuscript, then the bible. Dialogue is verbatim or it is invention. Run the
`continuity-gate` skill before any keyframe or emission is approved.
