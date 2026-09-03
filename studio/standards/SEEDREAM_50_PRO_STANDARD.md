# Seedream 5.0 Pro — Image Provider Standard

**Controlled pipeline document · v1.0 · 26 August 2026**

> **CONFIDENTIAL — integration-partner material.** The API parameters below
> come from a ByteDance document marked "for integration customers only".
> This file stays in this private repository. Do not publish it to an
> artifact, paste it into external tools, or share it outside the
> production. If any parameter changes, the public version on the official
> site takes precedence.

Seedream is the still-image side of the ByteDance stack (Seedance is video;
Seedance builds on Seedream internally). In this pipeline Seedream 5.0 Pro is
the candidate provider for keyframes, plates, character sheets — and, through
layer decomposition, for **derived staging data** the gates can consume.

Labels as in `SEEDANCE_25_STANDARD.md`: OFFICIAL / HOUSE / UNVERIFIED.

---

## 1. Basic facts — OFFICIAL

| Item | Value |
|---|---|
| Endpoint | `POST https://ark.ap-southeast.bytepluses.com/api/v3/images/generations` |
| Model ID | `seedream-5-0-pro` (sample uses a dated variant id) |
| Region | ap-southeast-1 |
| Auth | API key — server-side environment variable only, per house security law |

Common parameters (model, watermark, response_format, output_format…) match
standard image generation.

## 2. Layer decomposition — OFFICIAL

`layer_decomposition: true` decomposes **one input image** into a base image
plus up to **16 layers**, returning for each layer:

- `z_index` — stacking order, base image fixed at 0, larger sits higher
- `bounding_box.absolute` — `[left, top, right, bottom]` pixels in the base
  image's coordinate system (recommended for restoration)
- `bounding_box.normalized` — the same box quantised to integer 0–1000
- `name` — model-generated label for the separated element
- `description` — richer semantics (colour, state, material)

Input requirements: png/jpeg/bmp/tiff/gif (no heic/heif), ≤30 MB, total
pixels 512×512 to 6000×6000, aspect ratio between 1/16 and 16.

Hard constraints:

- **Single input image only** — multiple images error.
- **All-or-nothing** — one failed layer fails the whole request.
- At most **17 images returned** (base + 16 layers); extra requested layers
  may be silently lost — HOUSE: never ask for more than the frame plainly
  contains.
- `size`: `1K | 1.5K | 2K | auto` (auto follows the input's size band).
- Base image honours `output_format` (default jpeg); **layers are always
  png** (transparency).
- Unsupported in this mode: `sequential_image_generation`, `tools`, `stream`.

Prompt forms (OFFICIAL): omit the prompt to auto-separate every major
element; describe targets in natural language (annotation scribbles on the
input help positioning); or target exact regions with `<bbox>` tags in
normalized coordinates.

Usage is token-metered per generated image (a sample 8-image decomposition
billed ~23k output tokens). HOUSE: confirm partner watermark-off before any
production frame; verify pricing at the point of spend.

## 3. Interactive editing — OFFICIAL (preview)

Grounded, region-aware editing: point-select, lasso, arrow annotation and
sketch-over-image, colour-code preservation, small-text rendering, native
generation in 14 languages. Precision editing by coordinates replaces
"conversational retouching".

HOUSE: this is the still-image arm of the near-miss rule — a keyframe that is
90% right gets a targeted regional edit, never a fresh roll of the dice.

## 4. What this buys the pipeline — HOUSE

Three derived-data uses, in value order. Each turns a manual, error-prone
input into machine-derived fact:

1. **Speaker boxes computed, not drawn.** Gate D requires a face box because
   no lipsync route can choose a face. Decompose the approved keyframe; take
   the named character layer's `bounding_box.absolute`; that is the crop.
   The box becomes derived data with lineage instead of a hand-drawn guess.
2. **Ensemble manifests verified, not trusted.** Gate K takes each
   character's declared screen zone. Decomposition returns the *measured*
   zone from the approved frame — a verification pass can refuse a manifest
   that contradicts the actual composition before money is spent animating
   it.
3. **Plates recovered from staged frames.** The base image behind the
   character layers is, in effect, the location plate. Any approved staged
   frame becomes a second source of clean plates for `room_scope` and
   `scene_plate` work — the gap that produced the FR03 invented-kitchen
   incident.

Integration path when credentials exist: add a `seedream-5-0-pro` row to
`studio/providers.json` with a `layer_decomposition` capability flag; a
`box_from_layers` helper feeds Gate D and the Gate K verification pass.
UNVERIFIED until fired: layer-name reliability for named cast members —
stress-test name/description matching against character tags before any gate
depends on it.

## 5. Never overstate

- Layer decomposition quality claims ("on par with industry SOTA") are the
  vendor's; treat per-character layer naming as UNVERIFIED until our own
  stress cells pass.
- The partner document is a preview; parameters may change — the public API
  reference takes precedence at the point of use.
- Provider keys are server-side secrets: never in the browser, never in
  project records, never printed by workers.
