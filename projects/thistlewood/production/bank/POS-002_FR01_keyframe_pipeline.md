# POS-002 · FR01 — the first shot where the voice and the mouth are the same performance

**Approved:** 2026-08-14. Julian: *"there we go perfect"*.

This is the take that settled the architecture, so what it proves is worth
writing down precisely — several of the things it proves are things this studio
argued about all day and got wrong more than once.

## What FR01 is

Act One's opening beat. Tom Chen comes to the counter holding something wrapped
in a tea towel and asks *"Are you Mr Thistlewood? A lady at the market said — if
it's broken, it belongs here."* Nine seconds, locked-off wide two-shot, Richard
listening, Macsen on the counter.

## The chain that produced it

1. **Keyframe** — Julian generated it from a prompt this engine wrote, in his own
   tool, with the room plate and the character sheets as references. Not
   generated here. That is the accuracy gate and it is his hand on it.
2. **Animation prompt** — compiled on Seedance 2.5's Core Prompt Formula as
   flowing prose. Audited at **9.7** and stamped against the prompt's hash.
3. **Fired** on `minimax/h3/reference-to-video` — the keyframe as Image 1 with its
   role declared as the whole opening composition, then six character sheets
   roled as appearance and expression only and told not to recompose Image 1.
4. **Synced** — `fal-ai/sync-lipsync/v2`, driven from `FR01_Tom.mp3`, inside a
   560×600 box containing Tom alone.
5. **Assembled** — the synced track plus the room bed.

## The four things it proves

**A keyframe you generate beats a keyframe we generate.** The one this engine
made with nano-banana turned the workshop arch into a curtained recess, lost the
door bell and went too wide. Julian's held every lock.

**reference-to-video will reproduce a supplied frame if you tell it to.** The
worry when moving off image-to-video — which guarantees the first frame — was
that a composing route would restage. It did not. Frame one of the take is his
keyframe, reframed very slightly wider, with the staging, the screen direction
and every identity intact. The instruction that carries it is *"Reproduce it
exactly as the shot's opening frame and animate forward from there; do not
restage it and do not recompose it."*

**The character sheets earn their place.** The argument for dropping them was
that identity is already in the frame. Nine seconds is long enough for a face to
drift, the guide's own first-frame template pairs the frame with appearance
references, and its checklist asks outright whether every character is bound to
one. Bound: it holds.

**The mouth belongs to the sync stage, not the prompt.** Every prior attempt put
the scripted line in the prompt, let H3 invent speech and animate to that, then
laid our recording over the top. Those two can never agree. Removing the words
entirely, directing only a talking rhythm, and driving articulation from the
recording afterwards is what made this the first shot in the production where
the voice and the mouth are the same performance.

## The reusable shape

> **Julian's keyframe → prose prompt at 9.5+ → reference-to-video with the frame
> as Image 1 and the sheets roled behind it → sync inside a speaker box → bed.**

Six commands: `keyframe · compile · audit · brief · fire · sync · assemble`.
