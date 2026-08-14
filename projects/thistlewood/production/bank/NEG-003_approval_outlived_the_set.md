# NEG-003 · Approval does not survive a set change

**Found:** 2026-08-14, on the first contact sheet of the scene.
**Cost:** one shot carried a full day as *done* while it was already unusable —
and it was the only shot in the scene anybody had signed off.

## What happened

FR07 — Tom winds the box and the wrong tune spills out — was fired on
2026-08-13, approved, and banked as **POS-001**, the studio's first accepted
take. From that moment it was treated as finished: excluded from compile,
excluded from firing, marked `skip` in the shot table with a note explaining
that it was already approved and did not need recompiling.

On 2026-08-14 the front room plate changed. PL-04b replaced the old shop, and
every other shot in the scene was rebuilt around it.

FR07 was not rebuilt, **because it was approved**.

## How it was caught

Not by the gate, which never saw it — a skipped shot compiles to nothing and
gates nothing. It was caught by putting all sixteen landed takes on one contact
sheet and looking at them together. FR07 is instantly, obviously a different
film: darker, a different lamp, a different wall, and a figure sitting at a
table who does not exist in this scene.

Seen on its own it still looks like a good shot. That is the trap — **it was
still a good shot.** It had simply stopped being a shot from this episode.

## Why the skip flag made it worse

`skip: true` was doing two jobs at once and only one of them honestly:

1. *don't spend money re-firing this* — reasonable
2. *this shot is exempt from the standard* — never reasonable

An approved take is exempt from *re-firing*. It is not exempt from *canon*. When
canon moves, the approval it was granted under moves with it.

## The fix

FR07 rewritten as a full shot in the current grammar, in the current room. The
`skip` flag is gone from the scene.

Where a take genuinely is finished and must not be re-fired, the shot still
compiles and still gates — so that the day canon changes underneath it, the
gate has something to fail.

## The general rule this earns

> **An approval is stamped against a state of the world, not against a file.**
> When a plate, a lock, a character sheet or a script line changes, every
> approved asset downstream of it is provisional again until someone looks at it
> next to the new material.
>
> And the cheapest way to look at them together is **one contact sheet of the
> whole scene**. Sixteen shots reviewed individually all passed. The same
> sixteen laid side by side surfaced this in about four seconds.
