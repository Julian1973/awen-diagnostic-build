# Seedance 2.5 — Provider Standard

**Controlled pipeline document · v1.0 · 26 August 2026**

Built from ByteDance's *Dreamina-Seedance-2.5 Enterprise Use Case Guide*
(Lark document, modified 19 August 2026) via the Crystal Bears Technical
Foundation v1.1 reconciliation, cross-checked against the independent
capabilities report of 23 August 2026. This is the video-side law the
pipeline enforces; the engine (`studio/domain.py`) is its implementation.
Where this document and the code disagree, the code wins and this document
gets corrected.

## Authority labels

Every claim in this document carries one label:

| Label | Meaning |
|---|---|
| **OFFICIAL** | Stated in ByteDance provider documentation. The current technical boundary; recheck when the guide changes. |
| **HOUSE** | A reliability rule this studio earned in production. Applies to every shot unless the director signs an exception. |
| **UNVERIFIED** | Not confirmed by the official guide or production evidence. Never presented as a provider fact. |

---

## 1. Capability baseline — OFFICIAL

| Capability | Boundary |
|---|---|
| Maximum output | 30 seconds in one generated video |
| Total references | Up to 50 assets in one request |
| Images | 0–30 · up to 4K · ≤30 MB each · JPEG, PNG, WebP, BMP, TIFF, GIF, HEIC, HEIF |
| Videos | 0–10 · 480p–4K · ≤200 MB each · 2–30 s each · **total ≤30 s** · MP4, MOV |
| Audio | 0–10 · ≤15 MB each · 2–30 s each · **total ≤30 s** · MP3, WAV |
| Duration accounting | Video-reference and audio-reference 30 s budgets are counted **separately** |
| Modality combinations | Image / video / audio alone or in any combination |
| Languages | Native generation in more than 10 languages |

Interpretation (OFFICIAL): "30-second single-shot output" means one generated
*result*, which may contain internal shot changes. It does not mean one
uninterrupted camera take.

HOUSE: 50 references is capacity, not a recommendation. The stability envelope
in §4 is what we actually fire.

## 2. Task families — choose before prompting

Mixing generation, editing and extension language in one request blurs asset
roles. The task family is declared first (OFFICIAL task set):

| Task | Use when | Never when |
|---|---|---|
| Reference generation | No finished source video exists | A good clip needs only a local fix |
| First-frame I2V | An approved image must be the exact opening state | The image is inspiration, not the first frame |
| First-and-last-frame | Both endpoints approved; generate the action between | Endpoints differ in dimensions or geography |
| Video editing | A finished clip needs a surgical add/remove/replace | The performance or camera design needs rebuilding |
| Forward extension | The story continues from an approved clip's end | The next beat starts from an incompatible state |
| Backward extension | New material must lead into an existing clip | A clean preceding shot is safer as its own clip |
| Seamless bridge | A missing transition must connect two source clips | The clips have incompatible geography — that needs a motivated scene change, not a bridge |

HOUSE: reject a technically smooth bridge if it changes story logic, character
identity or spatial geography.

## 3. Parameter locks — OFFICIAL

Never fight a locked parameter in the prose prompt (HOUSE). Match the source
asset and set the compatible request instead.

| Task family | Aspect ratio | Duration |
|---|---|---|
| Editing | **Locked** to source; set ratio adaptive | Set `-1`; output aligns to source within ~0.3 s |
| First-frame / first+last | **Locked** to first frame; set ratio adaptive | User-defined. Assign `content.role = first_frame / last_frame`. Frames need **identical dimensions** or the last frame stretches |
| Extension | **Locked** to source; MOV recommended in and out | User-defined |
| Reference generation | Unlocked | Unlocked |
| Multi-panel storyboard | Unlocked / high-level | Guides plot; does **not** strictly lock visual detail |
| Independent keyframes | Unlocked / **closer alignment** | Separate keyframe images give strictly tighter visual alignment than a storyboard grid |

**Storyboard vs keyframe (OFFICIAL):** a storyboard communicates the broad
sequence; separate keyframe images control specific moments. A grid combined
into one image is not a frame-by-frame control surface. This is the provider's
own statement of the pipeline's keyframe semantics.

## 4. Stability envelope — OFFICIAL recommendations

The numbers we plan against, below the hard caps:

| Situation | Preferred | Stretch (expect retries) |
|---|---|---|
| Image-led subject references | **1–8 subjects** | 9–12 |
| Audio/video-led subject references | 1–5 subjects | 6–10 |
| Single-subject audio/video clip length | 5–10 s | near-2 s lacks information; near-30 s dilutes traits |
| Video-editing source length | ≤20 s | longer is less stable |
| Editing reference images | 1–5 | 6–8 |
| Storyboard panels | ≤15, stick-figure/line-art, **no text in panels** | — |
| 3D grey/clay reference | simple coarse geometry | detail reduces clarity |

Viewpoint rules (OFFICIAL): with ≤5 image subjects, single- or multi-view both
work; above 5, single-view is more stable. When multiple angles are needed,
upload **separate images per angle** — never combine views into one image.

Capacity priority when references are tight (OFFICIAL): core characters →
key props → scene environment → overall style.

## 5. The binding law — OFFICIAL

> "Do not place the only mapping information inside the reference image.
> Bind every asset explicitly in the written prompt. For several subjects,
> list each character-to-image and character-to-audio relationship
> separately."

This is the provider's own statement of the ensemble-manifest rule. The engine
enforces it as gate `K` (per-character binding on multi-character keyframes)
and compiles one binding line per subject. An unbound subject — not headcount —
is the documented failure driver.

## 6. Official structured-prompt foundation

The provider's prompt pattern, and how this pipeline maps onto it:

| Component | Official pattern | Pipeline mapping |
|---|---|---|
| Asset referencing | Identify assets by upload order and role | The compiled reference manifest — slot order is computed, never pasted |
| One-sentence summary | Subject + location + event + genre/style + camera | The shot card's identity line |
| Detailed plot | Timestamps or "Shot N"; visuals, camera, action, dialogue, sound | Compiled prose; Shot N by default, timestamps only where timing is truly fixed |
| Positive direction | Describe the desired result positively | Lead with correct behaviour; negatives stay surgical (the negative-prompt A/B remains an open, logged experiment) |
| Additional notes | Visual/audio details that must stay consistent | Sacred continuity facts + opening/closing state |

Timing controls (OFFICIAL): continuous intervals (0–4 s, 4–9 s…) with no
unexplained gaps; time points sparingly, for a cut, reveal, line or impact;
relative timing ("after three seconds") supported; dense per-second
micro-choreography discouraged — stage cause and effect instead.

## 7. What the engine already enforces

| Official fact | Gate / mechanism |
|---|---|
| Reference ceiling per route | Gate E · REFERENCE_BUDGET_EXCEEDED |
| Duration range per route | Gate F / Gate J (wrappers 3–5 s) |
| Per-subject explicit binding | Gate K ensemble manifest + compiled binding lines |
| Keyframe = distinct request type | Gate K · KEYFRAME_UNDERSPECIFIED |
| Chain needs named sacred facts | Gate H · CHAIN_UNDERSPECIFIED |
| Attachment list matches declared frame | Gate I · REFERENCE_AUTHORITY_CONFLICT |
| One camera action, held end frame | Gate G · WRAPPER_OVERLOADED |
| Route cannot pick a face | Gate D · SPEAKER_BOX_REQUIRED |
| Prompt audited against exact text | Gate C, hash-bound audits |

## 8. Known limits — never overstate

- Improved continuity and instruction-following are claimed; **perfect
  consistency is not guaranteed** in any generation.
- 30 seconds is a ceiling, not proof any action load stays coherent at it.
- Interface fields, access conditions, pricing and model identifiers change;
  verify at the point of use. Never invent API fields; never report an
  unsubmitted request as fired (the job ledger is the record).
- Access (as recorded 26 Aug 2026): API public since 7 Aug 2026, **no free
  quota**; enablement needs balance > USD 30.10 or an active 2.0-series
  resource package. Re-check before production spend.

## 9. Version control

When ByteDance updates the provider guide: review §§1–6 first, then re-run the
domain test suite — any rule that moved must move in `domain.py` and its test
in the same commit. When house canon changes, update shot-level data, not this
baseline.
