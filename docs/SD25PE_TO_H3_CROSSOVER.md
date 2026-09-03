# sd25-pe → minimax H3 · the crossover

sd25-pe is the official ByteDance grammar and it is calibrated to **Seedance**:
up to 30 seconds, 4–7 stages per 30s, `@Image1` tag syntax, its own audio model.
The house route is **minimax H3 reference-to-video**: 5–15 seconds, different tag
syntax, different audio behaviour.

Julian: *"the shot can't be 30 seconds as h3 doesn't do thirty seconds — this is
the crossover of all seedance."* Applying the skill wholesale imports arithmetic
that does not hold. This is the translation layer.

---

## TRANSFERS UNCHANGED — the structural grammar

**The multi-reference template.** `[Characters]` / `[Props]` / `[Scenes]` /
`[Motion and Audio]` / `[Event Script]` / `[Maintain Consistency]`. This is
route-independent and it is what the studio's emissions are currently missing.

**One explicit role per material**, with exclusions. *"Use only the facial
features, hair and clothing. Do not use its background."*

**Named subjects bound to references**, never described in competing prose.
`<Tom> corresponds to Image 1` — not "a man in a navy parka", which makes the
description argue with the reference.

**`[Maintain Consistency]`** — identity, clothing, prop count and ownership,
spatial orientation. Almost certainly why identity drifts between our shots.

**No invented numeric time ranges** (principle 7). Non-numeric stages only.

**No blanket negatives** (principle 8) — no watermark, subtitle or
duplicate-subject boilerplate.

**Dialogue in braces** `{like this}`, with the language named before it.

**Physics over adverbs**, observable end states, camera moves with named targets.

---

## DOES NOT TRANSFER — anything derived from 30 seconds

| sd25-pe assumes | H3 reality | Consequence |
|---|---|---|
| up to 30s | **5–15s**, integer | a shot is one or two beats, never four |
| 4–7 stages per 30s | **2–3 stages max** | more stages than that collide inside 15s |
| "30 seconds is a maximum, never a target" | 15s is the maximum | the split judgement fires far earlier |
| `@Image1`, `@Audio1` | **`Image 1`, `Audio 1`** — no `@` | minimax documents the unprefixed form |
| Seedance audio model | H3 **generates its own speech**, badly | see below |

---

## H3-SPECIFIC, not in sd25-pe at all

**Reference audio has a 2.0s floor.** Lines shorter than that get their
reference repeated — it fixes voice character only, so repetition is free.

**Generated speech is not usable.** Measured 2026-08-14: voice character drifts
within a shot, sync slips, and the model invents words where its audio model and
the prompt disagree. **The route renders picture; our ElevenLabs recordings are
the audio truth; a dedicated lipsync pass drives the mouth from our audio.**

**Duration floor of 5s.** Short exchanges are shot at 5 and trimmed to their cut
length in the edit.

**Resolution ladder** 480P / 768P / 2K / 4K, where 480P and 768P are native and
the upper two upscale a 768P base.

---

## THE RULE

**Compile to the sd25-pe template; budget to H3's clock.** Where the skill's
guidance depends on a number Seedance can hit and H3 cannot, the number is
H3's and the structure is the skill's.

Anything else is applying a grammar calibrated to one machine while firing at
another, which is what the studio has been doing.
