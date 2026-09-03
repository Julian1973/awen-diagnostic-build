# NEG-004 · Describing what the frame does not show is an instruction to build it

**Found:** 2026-08-14, by Julian, watching FR01–FR03 in sequence.
**Cost:** one take, and it would have cost every insert in the episode.

## What came back

FR03 is a tight insert: a counter top, a wrapped bundle, two hands. The keyframe
shows the counter filling the frame with warm dark shadow behind it and nothing
else legible.

The take pulled back and invented a room — pale walls, glazed cabinets down both
sides, and **a window with daylight through it**. A bright kitchen. Two stops
cooler than the shots either side of it, and nowhere in Thistlewood's.

Julian: *"there is no contiuntity in the rrom."*

## Why

Every animation prompt opened with the same scene clause:

> *In the front room of Thistlewood's, an old antique restorer's shop, with its
> long wooden counter, its cabinets of brass and glass, and the lit workshop
> showing through the arch behind, …*

On a wide two-shot that is a correct and useful description of the environment.
On a frame that shows **only a counter top**, it is a list of things that are not
in the picture — and a video model handed a list of things not in the picture
will put them in the picture. It has to render *something* behind the counter,
and the prompt just told it what.

**The keyframe was not ignored. It was completed.** Which is worse, because it
looks like the model disobeyed when in fact it obeyed the wrong instruction.

## The fix

The scene clause is now scoped to what the frame actually shows:

> *In Thistlewood's antique shop, of which this frame shows only the counter top
> and the warm shadow behind it, …*

and every insert carries a framing lock as its own sentence:

> *The framing stays exactly as tight as the first frame for the whole take. It
> never widens and never pulls back, and no further part of the room — no
> window, no doorway, no wall, no furniture beyond what Image 1 already contains
> — becomes visible at any point.*

Gated: an insert cannot compile without it.

## The general rule this earns

> **Describe the frame, not the location.** Everything a prompt names is
> something the model may draw, and anything it names that the first frame does
> not contain is a gap the model will fill. On a wide, the room is the frame and
> describing it anchors the shot. On an insert, the room is *outside* the frame
> and describing it is an invitation.
>
> The test before writing any scene clause: **is this visible in the keyframe?**
> If not, it does not belong in the prompt — and on a tight frame, say so
> explicitly, because silence is also a gap.
