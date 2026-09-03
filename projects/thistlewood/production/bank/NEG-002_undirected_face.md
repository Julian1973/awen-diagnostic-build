# NEG-002 · The undirected face

**Found:** 2026-08-14, Scene 1 dailies.
**Cost:** six takes — FR01, FR02, FR06, FR13, FR14, and the note that found them.

## What came back

Tom smiling. In FR01, in FR06 and in FR13 — three shots in which he is,
respectively, embarrassed to be in the shop at all, apologising for the object,
and saying *"I can't even get it to play a proper song."* He is smiling in all
three, warmly, at nobody.

Richard's *"Somebody's been reading my sign"* — scripted as **the faintest dry
amusement**, held almost entirely in the eyes — came back as a broad open grin.

## Why it happened, and why the prompt was not wrong

Nothing in the emission was incorrect. The shot table directed:

- **the body**, in `[Secondary Life]` — breathing, weight shifts, a hand lifting
- **the voice**, in the delivery note — *"quietly, the voice dropping in volume
  and never in pitch"*
- **the mouth**, in the speaker law — open for the speaker, closed for everyone
  else

And it said **nothing at all about the expression**. So the model chose one.

It will always choose one. Given a warm shop, a nice old man and a cat, it
chooses pleasant, because pleasant is the mean of everything it has ever seen in
a room like that. The gap is not that the direction was wrong — it is that
there was no direction, and an undirected variable is not left blank, it is
filled in by the average.

**This is the same shape as the speaker law.** An unassigned mouth moves. An
unassigned face smiles. Both are cases of the model resolving a silence, and in
both cases the fix is to remove the silence rather than to argue with the
result.

## The fix

An `[Expression]` block, compiled from a per-shot `faces` map, stating what each
face is doing while it is not talking — and where the beat needs it, saying
**not smiling** in those words.

```
[Expression]
<Tom>: defeated and embarrassed by his own defeat; eyes down, absolutely no smile
<Richard>: solemn and certain, entirely unhurried, no smile
```

Populated across fifteen of the eighteen Scene 1 shots. It costs about forty
words a shot.

## The general rule this earns

> **Direct every channel the audience can read, or the model will direct it for
> you toward the middle.** Body, voice, mouth and *face* are four separate
> channels. Three of them being right is a shot where a man grins through his
> own grief.
