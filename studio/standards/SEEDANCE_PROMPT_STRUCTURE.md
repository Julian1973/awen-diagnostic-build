# Seedance — Prompt Structure Standard

**Controlled pipeline document · v1.0 · 26 August 2026**

Source: ByteDance's official *Seedance 2.0 Prompt Template Library* (20
universal methods, 100 camera movements, bad/good prompt triage, effectiveness
solutions). **Provenance note:** this is a 2.0-era document. ByteDance's own
Seedance team has told us directly that **this structure remains the best way
to write and organise prompts for 2.5**. So: structure and method here are
current on the provider's word; every *technical number* (durations, reference
counts, formats, locks) defers to `SEEDANCE_25_STANDARD.md`, which is built
from the 2.5 guide. Where the two disagree on a capability boundary, 2.5 wins.

Labels: OFFICIAL / OFFICIAL-2.0 (2.0 doc, structure carried forward on staff
advice) / HOUSE / UNVERIFIED.

---

## 1. The universal formula — OFFICIAL-2.0

> Core entity (precise description) + time-sequential continuous actions
> (details + speed) + shot type + camera movement combination + specific
> scene and lighting + style + mandatory constraint instructions +
> negative prompt words

And the provider's own framing, worth pinning to the wall: **"A model is not
a human being; it does not understand 'atmosphere', and only grasps precise
engineering instructions."** 90% of model-performance complaints are
attributed to the prompt, not the model.

## 2. The official prompt template — OFFICIAL-2.0

The provider's standard template (translated from the guide):

```
[GLOBAL SETUP]
- Style: 2D animation / live action / 3D render …
- Multimodal references: the role of each image / video / audio
  (scene reference, character reference, timbre reference,
  camera-movement reference video)
- Constraints: (uniform, global)

[SHOT N | X–Y s]
- Shot size / camera position / lens: wide / medium / close / close-up,
  angle, movement
- Subject / action: who does what, precise to limbs and expression
- Scene / lighting: this shot's light and environment detail
- Style / quality: (only if a special requirement exists)
- Voice-over / SFX: this shot's sound
- Constraints: (shot-specific)
```

Pipeline mapping (HOUSE): our compiler already emits this shape — global
authority block, then per-shot prose with references bound inline. The
template confirms the order: **references and their roles are declared in the
opening, then every storyboard mention re-tags the asset** ("Boy A @Image1",
never bare "Boy A").

## 3. The bad-prompt triage — OFFICIAL-2.0

A prompt is BAD (reject before any audit scoring) if any of these hold:

1. **No shot structure** — no Shot 1 / Shot 2 / Shot 3 labels with
   time-sequenced content. A jumble only its author understands is a bad
   prompt by definition.
2. **References not associated with text** — roles not introduced in the
   opening, or storyboard mentions not tagged with the asset ("Boy A" instead
   of "Boy A @Image1").
3. **Vague adjectives** — "atmosphere", "cinematic feel", "looks nice",
   "premium". All must be replaced with specific, observable description.
4. **Not using the standard template** at all.

The guide's own worked example converts a wall-of-text prompt into
`[Global Setup]` + four tagged shots — and its criticisms of the bad version
("who is Nora?", "the sound is not assigned to any storyboard, so the model
places it randomly") are exactly the failures our gates refuse.

## 4. The good-prompt element table — OFFICIAL-2.0

| Element | Wrong | Right |
|---|---|---|
| Precise entity | "a girl" | "20-year-old East Asian woman with soft features, long straight black hair, white dress" |
| Action detail | "walking" | "walks slowly barefoot along the beach, arms swinging naturally, hair lifted by the sea breeze" |
| Scene | "by the seaside" | "the beach at dusk, setting sun and waves in the distance" |
| Light | "atmosphere" | "backlit by the setting sun, golden Tyndall effect, soft spreading light, gentle contrast" |
| Camera | "take a nice shot" | "medium shot composition, steady tracking" |
| Style | "cinematic feel" | "retro film style, rich colour, distinct grain" |
| Constraints | *(not written)* | "face stable without deformation, clear features, no subtitles" |

**Resolved internal contradiction:** the guide's basics section says to add
"4K UHD, 60fps, HDR" quality phrases; its later authoritative note says
image-quality specs **"do not need to be included in prompts, as they cannot
be controlled via prompts."** The later note wins (HOUSE): resolution and
frame rate are provider request parameters, not prose — same principle as
"never fight a locked parameter in the prompt."

## 5. Structure rules carried forward — OFFICIAL-2.0

- **Subject definition**: core attributes + appearance features + state; the
  highest-weight instruction in the prompt.
- **Sequential action**: order, speed and amplitude — never isolated
  single-point movements (the cause of choppy motion and limb distortion).
- **Scene–movement pairing**: one shot size + one camera movement per beat;
  beginners start with medium-shot slow push / full-shot slow pull.
- **Light as observable fact**: light type + light-dark behaviour, never mood
  words.
- **One style rule**: 1–2 style keywords maximum; mixing "retro" +
  "cyberpunk" + "Japanese style" fragments the image.
- **Camera ceiling**: at most 2 movement types per prompt (our wrapper gate
  is stricter — one — because a wrapper is a single beat).
- **Low-intensity motion preference**: "slow" and "steady-paced" beat "fast
  running, intense dancing" for stability.
- **I2V consistency phrase**: for image-to-video, add "completely consistent
  with the main subject of the reference image, no modification to the core
  settings".
- **Negative prompts stay minimal**: core failure points only (no face
  distortion, no limb deformity, no clipping) — never a universal negative
  wall. (Our negative-prompt A/B remains open; this endorses the surgical
  end of it.)
- **Weight labels** `{1.0–1.5}` on core subjects and constraints —
  OFFICIAL-2.0, UNVERIFIED on 2.5: test before relying on it.
- **Rhythm control**: explicit beats ("freeze in slow motion for 3 seconds,
  then resume at constant speed").
- **Camera-movement vocabulary**: the guide ships 100 named movements in four
  tiers; the basic ten (dolly-in, slow pull-back, pan, vertical pan, orbit,
  tracking, fixed, macro, freeze-frame, slight handheld shake) cover 80% of
  scenarios. Name movements from this vocabulary rather than inventing
  phrasing.

## 6. The effectiveness playbook — OFFICIAL-2.0

Provider-documented fixes for the classic failures:

| Failure | Official fix |
|---|---|
| **ID drift / face swap** | Crop the face region into its own image and attach it as an **independent reference**, plus "the character image strictly refers to @ImageN (face image)". *(Independently validates our speaker-box face-crop discipline.)* |
| **Unwanted subtitles / text** | "keep no subtitles", "avoid generating any text"; landscape orientation is markedly less subtitle-prone than portrait; Volcano Engine offers fine-grained subtitle erasure as the last resort. |
| **Twin paradox** (duplicate character in frame) | Stable unique naming for every entity mention + "do not duplicate the same character in the same frame; no multiple characters with identical faces". |
| **Layout shift at extended-mode junctions** | **Trim 6 frames from the end of the preceding segment and 1 frame from the start of the following segment.** *(The official numbers behind our house "trim 6–12 frames of breathing room" law — adopted as the precise junction rule.)* |
| **Timbre / pronunciation misses** | Describe timbre characteristics in words alongside the reference audio; keep line style close to the reference; swap problem words for common homophones. |

One-reference-one-job (OFFICIAL-2.0): character appearance, scene space, pose
sketch and prop information each get their own image — mixing them in one
image weakens constraint and causes pose drift, character misalignment and
props in the wrong context. (Now also OFFICIAL in the 2.5 guide.)

## 7. The provider's quality policy — and our mechanical version

The guide recommends clients institutionalise prompt quality (OFFICIAL-2.0):
mandatory review of every prompt before generation; a daily published
**"gacha rate"** (one-attempt success rate) per creator; an internal
best-practice template library; weekly good/bad prompt reviews.

This pipeline already runs that policy, mechanically (HOUSE): the audit loop
with a ≥9.5 floor is the mandatory review; hash-bound audits make skipping it
impossible (gate C); the ledger records attempts per shot, which *is* the
gacha rate; the standards directory and skills are the template library; the
lessons bank is the weekly review with scars attached. **This is partnership
evidence: ByteDance's own recommended operating policy, implemented as
refusing code rather than as management guidance.**

## 8. Precedence

Structure and method: this document. Technical boundaries: `SEEDANCE_25_
STANDARD.md`. Enforcement: `studio/domain.py` and its gates. Code > standard >
memory, as ever.
