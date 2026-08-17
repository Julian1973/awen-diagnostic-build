# Studio Memory — the Replit build brief

Paste this whole document into Replit Agent as the build prompt. The canonical
source of truth for every rule below is the `studio/` directory of
`julian1973/awen-diagnostic-build` — `domain.py` (the rules), `schema.sql` (the
shape), `worker.ts` (the job lifecycle), `lipsync_worker.py` (stage 07),
`stress_worker.py` (stage 05), `providers.json` (the capability registry).
Where this brief and that code disagree, the code wins.

---

## What you are building

**Studio Memory** — a production-control web application for AI film and video
generation. The model generates pixels; this application owns project memory,
quality gates, auditability, recovery and delivery control.

The premise everything rests on: **the model has no memory between generations,
so the application is the memory.** A character's face is redrawn from scratch
on every generation; if his appearance is not in the request, the request gets a
different man.

Stack: **Next.js (App Router) + Postgres + object storage + a queue worker.**
Use Replit's own Postgres and object storage. All provider credentials are
server-side secrets only — they must never reach the browser.

---

## The stages and the gates

```
PRE-PRODUCTION                      PRODUCTION                 FINISHING (human)
1 breakdown   script → shot cards   6 generate                 9  colour
2 references  images as spec        7 lip-sync from recording  10 sound
3 bible lock  written decisions     8 assemble                 11 master
4 passports   descriptor + files
5 stress test proved 10/10
```

Between them, four gates. **A gate refuses — it never merely warns.**

| Gate | HTTP | Code | Refuses when |
|---|---|---|---|
| A | 409 | `BOARDS_PENDING` | any reference board a shot depends on is still pending |
| B | 409 | `LOCKED_ASSETS_REQUIRED` | any required asset is not `locked` — checked at compile AND again at submit |
| C | 409 | `AUDIT_MISSING` / `AUDIT_INVALIDATED` | the current prompt text has no passing audit round of its own |
| D | 409 | `SPEAKER_BOX_REQUIRED` | a multi-face shot has dialogue and no confirmed speaker box |
| E | 422 | `REFERENCE_BUDGET_EXCEEDED` | the reference set exceeds the provider's ceiling |
| F | 422 | `DURATION_OUT_OF_RANGE` | the shot length is outside what the route honours |

---

## The data model

Port `studio/schema.sql` to the app's Postgres (it is written for Postgres
already). The tables: projects, scenes, shots, assets, asset_files,
reference_boards, board_references, stress_tests, shot_assets, prompt_versions,
audit_rounds, generation_jobs, generation_outputs, generation_logs, selections,
lessons — plus a dependency table for downstream invalidation.

Non-negotiable columns and why:

- `shots.speaker_box` (normalised 0–1 coords) + `shots.speaker_asset_id` — no
  lip-sync provider can be told which face to drive; on a two-shot it picks one,
  and the first time it ran it put one man's line on the other man's mouth.
- `shots.frame_source` (`keyframe` | `chain_continue` | `chain_cut`) — chaining
  the previous take's last frame is how the room stops drifting.
- `shots.room_scope` (`full` | `partial` | `none`) — a prompt naming things
  outside the frame is an instruction to draw them; a counter-top insert once
  came back with an invented kitchen.
- `prompt_versions.prompt_hash` (sha256) and `audit_rounds.prompt_hash` — an
  audit belongs to the exact text it scored. If the text changes by one
  character, the audit is invalidated automatically.
- `assets.scale_landmark` — body scale is stated as landmarks ("her head
  reaches his shoulder"), never centimetres.
- `assets.default_expression` — an unstated face gets filled in with
  "pleasant"; a man once smiled through three shots about his grandmother's
  broken heirloom.

---

## The rules engine

Do **not** re-derive the production rules — port them faithfully from
`studio/domain.py`, function by function, into a server-side TypeScript module
(`lib/domain.ts`). The functions and their exact behaviours:

- `derive(stack)` — capability flags drive pipeline behaviour: a provider with
  `speech: "generated"` means dialogue words NEVER enter a visual prompt; no
  `face_select` means speaker boxes are required; `refs_max` and `dur` are hard
  limits, not preferences.
- `evaluate_gates(...)` — returns the table above with human-ready `detail`
  strings. Map `blocking[0].code` straight onto the HTTP response.
- `compile_prompt(...)` — receives ONLY immutable snapshots. It never queries
  "latest asset by tag". Room-scope behaviour, the chain-cut wording ("carry its
  continuity, not its composition"), the no-dialogue rule with its stated
  reason, and the `[Maintain Consistency]` closer are all load-bearing.
- `impact(...)` — downstream invalidation. Revising an asset marks its shots'
  prompt versions stale, kills their audits, and flags accepted takes for
  re-review. **Nothing is ever deleted; approved becomes provisional.**
- `stress_cells(...)` / `stress_run_verdict(...)` — the stage-05 plan and its
  verdict: an unreviewed cell is not a pass, ONE failed cell fails the run, and
  a revised asset makes the whole run STALE (distinct from failed).
- `iteration_advice(...)` — below the floor: correct and re-audit. At round 8:
  "the SHOT is wrong, not the sentence." At round 15: blocked.

Keep the port covered by the same test cases as `studio/test_domain.py` (48
checks) — each test names the production incident it protects.

---

## The generation worker

Port `studio/worker.ts` as the queue worker (it is already TypeScript). The
lifecycle, none of it optional:

1. gate check at enqueue → 2. immutable snapshots → 3. job row committed
BEFORE any provider call → 4. idempotency key = `shotId:promptHash:attempt`
(unique constraint) → 5. claim → 6. submit → 7. **persist provider_task_id
immediately** → 8. poll with backoff → 9. copy output to app-owned object
storage (provider URLs are temporary) → 10. probe + proxy → 11.
`review_pending` → 12. every transition appended to the ledger.

Retry policy: transport failures (timeout/429/5xx) retry with backoff and are
logged. A submitted task is NEVER resubmitted. A semantic failure or a bad
result is never auto-retried — that is a human decision.

The provider is an adapter (`ProviderAdapter` interface). First adapter:
**BytePlus ModelArk** (Seedance) — exact model id, endpoint/region and payload
keys come from the account owner's configuration screen, entered as server
secrets, never hard-coded.

## The lip-sync worker

A separate job type, mirroring `studio/lipsync_worker.py`: crop the speaker
region at the stored normalised coordinates → upscale if the face is small →
submit crop + the recorded dialogue file → composite the synced crop back at
the same coordinates → verify duration → write the output WITH a lineage
payload (source output id, speaker box, voice asset revision, provider, sync
job id, composite algorithm version).

## The stress-test screen

Mirror `studio/stress_worker.py`: plan cells from the asset (frozen to its
revision), generate cheap stills via the image provider, show them as a contact
sheet, let a reviewer mark every cell pass/fail with notes, compute the verdict.
An asset **cannot lock** without a passing run; a revision reverts it to draft.

---

## The screens, in build order

1. **Project home** — pipeline board, blocked-scene counts.
2. **Asset registry + passport editor** — descriptor, scale landmark, default
   expression, files, variants, stress status, lock button (which refuses).
3. **Reference boards** — captions required on every image, ban list, written
   decisions only.
4. **Shot-card editor** — the 22 fields, frame source, room scope, speaker +
   speaker-box drawing tool (drag a rectangle on the frame; stored normalised).
5. **Prompt preview** — compiled blocks, reference manifest in order, audit
   state, gate report with codes.
6. **Generation queue** — job states, task ids, retries, costs, ledger.
7. **Review room** — player, A/B takes, checklist, approve into selects.
8. **Stress test** — plan / stills / contact sheet / per-cell review / verdict.

Design: warm paper ground, ink text, one accent for structure and a reserved
red ONLY for gate refusals. No dashboards-for-dashboards'-sake; every number on
screen is one someone acts on.

---

## First milestone (do not broaden until this passes repeatedly)

One scene end to end: create project → one character passport + one location
passport → upload references → stress-test → lock both → one shot card →
compile → audit → gates all green → submit one real BytePlus task → ingest →
review → approve into selects → export the edit manifest.

## Definition of production-ready

- Credentials never reach the browser.
- A shot cannot generate on a draft/deprecated asset or an unaudited prompt.
- A multi-face dialogue shot cannot sync without a confirmed speaker box.
- A crash cannot lose job state or double-charge a provider.
- Every output is archived in app-owned storage.
- Every selected take reconstructs its full provenance.
- Script/asset changes mark downstream approvals provisional (never deleted).
- Human review is the final acceptance gate.
- The provider changes through the adapter, not a rewrite.
