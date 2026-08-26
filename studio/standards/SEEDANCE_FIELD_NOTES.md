# Seedance 2.5 — Field Notes

**Controlled pipeline document · v1.0 · 26 August 2026 · accumulating**

Practitioner evidence from working creators, kept separate from the official
standards on purpose: everything here is **PRACTITIONER** grade — field-tested
by someone else, UNVERIFIED on our stack until our own runs confirm it. Claims
that merely restate an official rule are tagged [ALIGNS]; claims that add new
craft are tagged [NEW]; claims that sharpen an official number are tagged
[REFINES]. Sponsor/promotional content in sources is discarded without note.

A claim graduates out of this file in one of two directions: confirmed on our
runs → a HOUSE rule or a lessons-bank entry with the incident attached;
contradicted → recorded here as refuted so nobody re-imports it.

---

## Source 1 — "the working manual" creator video (Aug 2026)

Single-prompt multi-shot scenes with native audio; a week of daily use;
several claims carry run counts. Sponsored segments removed.

### The four-lane model — [ALIGNS]

> Text prompt owns **intent** (what happens, in what order). Image references
> own **identity and style**. Video reference owns **motion**. Audio owns
> **timing**. "If a detail can live in a reference, it never goes into the
> prompt."

This is our reference-contract architecture stated as a habit. His observed
failure — describing faces and motion in prose, then wondering why every run
drifts — is the exact disease the roled manifest cures.

### Prompt craft

- **[NEW] Write the chain of causes.** Bind sequential actions with *while*
  and *then* — the model parses both as timing instructions. A flat list of
  subjects yields "a photograph with jitter"; a causal chain yields a scene.
  Observed failure mode: not a broken frame but **a chain that runs out of
  clip one link short** — the last action never arrives. Duration must fund
  every link.
- **[NEW] One verb per subject.** Three subjects each doing one thing: fine
  (chef flambés WHILE cat knocks glass THEN waiter catches). Two actions
  stacked on one subject collapsed his success rate across eight runs. Split
  the second action into its own clip — one extra generation is cheaper than
  fighting the model.
- **[ALIGNS] Concrete nouns, never adjectives.** "Fancy kitchen" returned a
  different generic counter every run; "copper pot on a marble counter"
  returned those two objects every time.
- **[NEW] Name materials to buy physics.** "Water spilled across a steel
  counter" produced correct pooling, spread and reflection unprompted. The
  material name carries its physics for free.

### Camera craft

- **[ALIGNS] Real cinematography vocabulary.** "Orbit" landed first try;
  "go around the building" gave a mushy sideways drift. The vocabulary is
  control, not decoration.
- **[ALIGNS] Moves execute in written order** — put the move the shot
  depends on first.
- **[REFINES] Three camera moves per clip is the practical ceiling** on 2.5;
  a fourth blended the last two into wobble. (Official 2.0 guidance said max
  2; our wrapper law stays at 1 — a wrapper is a single beat.)
- **[NEW] Anchor every move to a subject.** "Orbit around the lighthouse"
  holds; "orbit right" wanders — the model needs something to rotate around.

### Image-to-video (keyframe animation)

- **[NEW] Compose the still with motion room** — empty space in the
  direction the movement will go. A cluttered flat lay with no depth stayed
  nearly frozen: nowhere to move. **Direct candidate for our keyframe-prompt
  compiler: every keyframe brief should state where the motion room is.**
- **[NEW] The one-tenth face rule.** A face smaller than ~1/10 of frame
  drifts identity on 2.5 (confirmed across five progressively wider runs).
  Crop tighter when the face carries the scene, or plan the cutaway at the
  drift point.
- **[ALIGNS] I2V prompts describe change only** — the model already sees the
  frame; re-describing it competes with what it is looking at. (Our
  "describe the frame, not the location" law from the other side: describe
  neither what it sees nor what it should re-imagine — only what changes.)

### Cost discipline

- **[NEW] Draft at 720p/1080p, render 4K once, when the shot is locked.**
  Native 4K is a single-pass render, slower and dearer per generation.
  Candidate HOUSE rule for the worker's tier selection.

### R2V — motion from footage

- **[ALIGNS] Motion reference replaces motion prose.** Prompt describes
  character and environment ONLY; describing motion in text while feeding a
  motion reference makes the two instructions compete — "you get mush."
  (Same competition law as every other double-authority failure.)
- **[NEW] Reference clip under 15 seconds** — sync slips on longer takes.
- **[NEW] Locked-off camera in the reference** — camera movement in the
  reference fights camera movement in the prompt.
- **[NEW] Whole body in frame** — anything cropped out is invented.
- **[NEW] Face sets need a 3/4 angle** whenever the motion reference turns
  away from camera; an all-frontal set forces the model to invent a generic
  profile for those frames.

### Restyle (style transfer) — distinct from R2V

R2V hands the model a performance and lets it invent the frame; a restyle
pass hands it a finished frame and changes only the look, keeping shot
composition and timing.

- **[NEW] Attach a face reference even on a restyle** — otherwise the face
  is just one more surface to repaint, and it shifts between shots.
- **[NEW] Stabilise footage before feeding it** — the model copies handheld
  shake faithfully and it cannot be removed afterwards; on a stylised
  character real jitter reads wrong.
- **[ALIGNS] Prompt stays purely on art style** — any action word fights the
  motion already in the footage.

### Reference budget under load

- **[REFINES] The silent-averaging failure signature.** At ~25 references
  the model **never errors — it quietly averages**: two similar character
  references merged into a face matching neither; style frames collapsed
  into generic mood. Working ceiling observed: **15–20 total references**,
  8–18 clean. (Official: 50 is capacity; 1–8 image-led *subjects*
  preferred. These compose: subjects stay ≤8, total roled assets ≤20.)
- **[ALIGNS] One job per reference — and never two references answering the
  same question.** Two photos of the same actor from different shoots
  average into a stranger; pick the better one and delete the other.

### Chaining past 30 seconds

- **[ALIGNS] Carry the FINAL frame forward** — never a middle frame, never
  the original reference. (Our chain law, verified at 90 seconds with faces,
  wardrobe and a scar holding.)
- **[NEW] Lock the lighting description word-for-word in every segment.**
  Lighting is what slipped on his chain — room two rendered warmer despite
  identical intent. A sacred continuity fact that must be literal, repeated
  text, not a remembered vibe. **Candidate: lighting line auto-carried by
  the compiler on chained shots.**
- **[NEW] Budget one grading pass across any chained scene** — even a good
  run needs the colourist; plan it in the schedule, not as a surprise.

### Native audio

- **[ALIGNS] Name sounds like props** ("rain hitting metal", "a crowd
  murmuring two rooms away"); an unnamed soundscape gets the model's generic
  default.
- **[ALIGNS] Dialogue routes by capability** — on a native-audio pass, write
  the line verbatim and the mouth times to it. (On our sync-route shows the
  line stays out and the recording drives the mouth — capability registry
  decides, as ever.)
- **[NEW] An attached music track is a timing instruction, not decoration** —
  cuts and camera moves land on its beat without timestamps. Trust on short
  clips; verify sync manually on long ones.
- **[ALIGNS] Native audio is a strong first assembly, not a finished mix.**

### Model defaults fill prompt gaps — [ALIGNS]

The same 20-word prompt run on four models returned four different films:
2.5 shot directed multi-angle coverage; 2.0 held one calm reframing angle;
others went theatrical or documentary. **Every prompt has gaps, and the
model's default taste fills them** — so route by whose defaults point where
the project is heading. This is the capability-registry philosophy stated
from the consumer side, plus one routing fact worth keeping: **2.5's default
taste is directed coverage; 2.0's is a calmer single setup** — for a held
mood beat the older model can be the better read of the same sentence.

---

## Source 2 — extension & multi-round chaining research (Aug 2026)

Compiled research on Seedance extension workflows (ByteDance official
examples plus Kapwing / Morphic / Melies / ComfyUI / Crepal guides). One
claim in it is OFFICIAL — ByteDance's own extension prompt — and has been
promoted into `SEEDANCE_25_STANDARD.md`. The rest is PRACTITIONER.

### The delta rule — [NEW], the strongest claim in the source

An extension prompt describes **only what happens after the handoff frame**,
and explicitly states what is *already true* so the model does not replay it:

> "The door is already closed. Do not repeat the closing motion."

The documented failure is the action repeating at the cut (a door closing
twice). Extension treats the prior clip as ground truth; the prompt carries
delta only. **Compiler candidate: chained shots emit an "already true — do
not repeat" clause built from the predecessor's end state.** This is our
"describe the frame, not the location" law extended into time: describe the
change, not the history.

### The extension anchor block — [ALIGNS + NEW]

The tested continuation structure opens with an explicit anchor clause:

```
Extend @Video1 forward.
The first frame of the extension continues directly from the last frame
of @Video1.
[Already-true facts that must not repeat.]
[The new action, camera move, and end state — nothing else.]
CONTINUITY: [2–3 fixed identity anchors]
CONSTRAINTS: do not reintroduce completed actions; do not alter locked
geography.
```

- **[NEW] Pin Task Type to "Extend"** — left on Auto, a loosely-worded
  continuation can be read as a brand-new clip request. Worker-level
  setting, never trusted to inference.

### Identity anchors — [REFINES]

- **2–3 distinctive, verifiable anchors** (red scarf, nose ring, green wool
  coat) beat a full biography — **over-specifying invites contradictions**.
  Refines our sacred-facts law with a count: continuity_requirements on
  identity should be few and checkable, not exhaustive.
- **Restate anchors at continuity risk points**: after cuts, after occlusion,
  after a major angle change, whenever a character re-enters frame.
- **[NEW] Re-anchor from the ORIGINAL reference, never a generated frame**,
  when drift is systemic — errors compound generation-over-generation. Our
  pipeline already conforms structurally (character sheets attach to every
  chained shot; the held frame carries composition, the sheets carry
  identity) — this names *why* that split matters.
- **[NEW] State facts vs identity facts are separate rule types**:
  accumulated dirt, wet clothing, a torn sleeve are *state* continuity
  ("soot accumulates and never resets"), not identity — they need their own
  explicit carry rule or they silently reset at every cut.
- **[TENSION] Reference strength 70–80%** claimed optimal (>~85% stiff,
  <~60% drifts) — note the gold template (Source: official video template)
  sets identity-critical weights at 0.86, *above* this source's stiffness
  line. Unresolved; the weight-mechanism test in the adoption queue should
  settle both at once.

### Geography — [ALIGNS, two additions]

One labelled location reference reused every round (our scene-plate law);
explicit spatial assignment per subject before motion (our ensemble
manifest); clay-render blocking for complex geography (already in the 2.5
standard). New:

- **[NEW] Tie every camera move to a triggering action** — "As his feet
  leave the ground, move from rear tracking into a low side angle" — so the
  cut's spatial logic is causally grounded, not arbitrary. Composes with
  Source 1's "anchor every move to a subject": anchor to a subject AND to a
  cause.
- **[REFINES] On a bridge between two separately generated clips, declare
  one clip the sole geography master** — bridges/backward extensions are the
  highest-risk case for props or characters appearing in the wrong place.
  Extends the 2.5 standard's bridge workflow with an authority declaration,
  exactly our frame_source philosophy.

### Process — [ALIGNS]

The source's recommended shot ledger (shot ID, anchors, seed, notes), QA
pass (anchor audit, lost-prop scan, cross-shot lighting check) and
last-frame "state ledger" are our closing-state ledger, dailies review and
held-frame law under other names. One addition worth testing:

- **[NEW] Lighting described as Source → Direction → Quality → Effect** —
  a four-part formula that makes the lighting line concrete enough to carry
  word-for-word across a chain (composes with Source 1's lighting-carry
  rule).

Platform note for the Replit build: third-party front-ends advertise
extension to ~180 s total, and a ComfyUI "Extend Video" node graph automates
last-frame-trim-and-splice for scripting — a reference implementation if we
automate the chain loop server-side.

---

## Adoption queue

Test-first (one cheap run each) before promoting to HOUSE:

1. Motion-room clause in keyframe briefs (compiler wording change).
2. The 1/10-face rule as a keyframe-brief check.
3. Word-for-word lighting carry on chained shots (compiler change).
4. Draft-tier / final-tier render policy in the worker.
5. While/then chain phrasing + one-verb-per-subject as audit criteria.
6. The 15–20 total-reference working ceiling alongside gate E's route cap.
7. The delta rule: compiler emits an "already true — do not repeat" clause
   on chained shots, built from the predecessor's end state.
8. Task Type pinned to Extend in the worker's request builder, never Auto.
9. Anchor count discipline: 2–3 identity anchors in
   continuity_requirements, restated at occlusion/re-entry points.
10. The reference-weight test (one experiment settles three claims:
    {1.0–1.5} labels vs numeric weights vs the 70–80% band vs 0.86).
11. Lighting as Source → Direction → Quality → Effect, carried verbatim.
12. State-vs-identity continuity: an explicit "accumulates and never
    resets" rule type for wear, wetness, damage.
