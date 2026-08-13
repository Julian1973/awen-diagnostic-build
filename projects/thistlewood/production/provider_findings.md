# Provider findings — fal, first real firing day
Thursday 13 August 2026. Everything here was paid for and observed, not read
in a doc. Recorded so the studio never re-learns it.

## 1. The Seedance multi-reference route is unusable on this account
`bytedance/seedance-2.5/reference-to-video` accepts the submission, queues,
runs **79 seconds of real inference**, reports `COMPLETED` — and then the
result fetch returns:

```
422  loc: ['body','image_urls']
     "Invalid input in 'image_urls'. Please verify the URL points to a valid,
      supported file and try again."
```

Ruled out, one at a time:

| Suspected cause | Test | Result |
|---|---|---|
| `.webp` unsupported | converted both refs to PNG, re-fired | same 422 |
| files unreachable | `GET` each uploaded URL | HTTP 200, valid PNG magic bytes |
| oversized | 2.3 / 2.8 MB against a 30 MB cap | fine |
| bad aspect / dimensions | 1672x941 and 1640x959, aspect 1.7-1.8 | fine |
| wrong host | ours is `v3b.fal.media`, same host as fal's schema example | fine |
| wrong route id | openapi probe | 200, id correct |
| `@Image 1` vs `@Image1` spacing | isolation test used `@Image1` | still failed |
| **our files at all** | **isolation test with fal's OWN documented example image** | **same 422** |

The last row is decisive: fal's own example image fails on this route. It is
an account or route fault, not our payload. **Do not spend more on it until
fal is asked directly.** Note the cost shape — it bills inference and then
throws the result away, so each attempt is a full-price nothing.

## 2. The upload endpoint in fire.py had never worked
`https://rest.alpha.fal.ai/storage/upload` returns 404. The live endpoint is
`/storage/upload/initiate`. Every previous "the rig is ready" claim rested on
code that could not have uploaded a single file. Fixed.

## 3. minimax route ids are a trap
- `minimax/h3/image-to-video` — correct, **no `fal-ai/` prefix**
- `fal-ai/minimax/h3/image-to-video` — 404
- `fal-ai/minimax/hailuo-03/image-to-video` — a DIFFERENT endpoint, locked to
  `resolution: const "2K"`, prompt ceiling 2000 chars. Firing this by mistake
  means paying 2K prices for a beat we wanted at 480p.

Real H3: resolutions `768P / 2K / 4K`, duration 5-15 integer, prompt ceiling
50,000 chars, one image, no `@Image N` role syntax.

## 4. H3 silently rewrites your prompt unless you stop it
`enable_prompt_expansion` defaults to **true** — a vision-language model
rewrites the prompt before generation. Left on, every verdict is
unattributable: you cannot tell whether a defect came from our emission, the
rewrite, or the model. Forced `false` in the registry. Same class of rule as
never letting a provider edit an approved emission.

## 5. What this does to the Emission Standard
Both working routes are **single-image image-to-video**. The two-reference
structure the standard is built around — keyframe as `@Image 1`, hero prop
identity as `@Image 2` — cannot be expressed on either. The box's cracked comb
has to survive in prose, or not at all.

Consequence to decide at the next review: either the standard grows a
single-reference emission form (prose carries what the second reference used
to), or reference-to-video gets fixed with fal and the standard stays as is.
Do not quietly write two dialects and let them drift.

## 6. ElevenLabs key was an ID, not a key
The string supplied is the key *ID*. ElevenLabs: *"API key ID used as API key
— only valid API keys can be used. API keys start with `sk_`."* Keys are shown
only at creation, so recovering one means issuing a new one.

## Model registry, as verified today
| name | route | refs | resolutions | duration | audio |
|---|---|---|---|---|---|
| `seedance` | `bytedance/seedance-2.5/reference-to-video` | many | 480p/720p | 4-30 | yes | **BROKEN — 422** |
| `seedance-i2v` | `bytedance/seedance-2.5/image-to-video` | one | 480p/720p | auto,4-30 | yes |
| `minimax` | `minimax/h3/image-to-video` | one | 768P/2K/4K | 5-15 | no |
