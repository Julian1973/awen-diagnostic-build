# AI Animation Pipeline — script to post

A config-driven orchestrator that takes a **topic** and produces a
**review-ready package** for a fully AI-generated animated video:

```
research → script → voiceover → animation → thumbnail → assemble → package
```

The chosen workflow is **generate, then post manually**: the pipeline
stops at a folder containing the finished video, the thumbnail, and the
metadata to paste into the upload form. Publishing stays in your hands
(and a publisher can be wired in later — see *Roadmap*).

## Quick start

No dependencies — Python 3.11+ standard library only.

```bash
# From a config file
python -m pipeline run --config config/pipeline.example.json

# Or from a one-off topic
python -m pipeline run --topic "why the sky is blue" --provider mock
```

Each run writes to `out/<topic-slug>/`:

```
out/why-the-sky-is-blue/
├── assets/
│   ├── scene_01.txt … scene_03.txt   # per-scene clips (placeholder)
│   ├── voiceover.txt                 # narration audio (placeholder)
│   ├── thumbnail.txt                 # thumbnail (placeholder)
│   └── final_video.txt               # assembled video (placeholder)
├── manifest.json                     # machine-readable package summary
├── POST_CHECKLIST.md                 # human review + upload checklist
└── state.json                        # resume state
```

Runs are **resumable**: re-invoking picks up at the first incomplete
stage. Use `--force` to re-run everything.

## How it's built

The orchestrator owns the boring, deterministic glue — directories,
stage ordering, resume state, and the manifest — and delegates all
*generation* to a **Provider**. The same pipeline runs against any
provider without stage code changing.

| File | Responsibility |
|---|---|
| `pipeline/orchestrator.py` | Runs stages in order; skip/resume/force |
| `pipeline/stages/steps.py` | The ordered stage definitions |
| `pipeline/providers/base.py` | The `Provider` contract |
| `pipeline/providers/mock.py` | Self-contained fake provider (writes placeholder files) |
| `pipeline/providers/vidiq.py` | Real-generation seam, backed by the vidiq MCP tools |
| `pipeline/config.py` | Run configuration (JSON, or YAML if PyYAML is present) |
| `pipeline/state.py` | Per-run resume state |
| `pipeline/manifest.py` | The review-ready `manifest.json` + `POST_CHECKLIST.md` |

### Providers

- **`mock`** (default) — fakes every stage and writes real placeholder
  files, so the whole flow runs with no network or credentials. Use it
  to develop and test the orchestrator.
- **`vidiq`** — the integration seam for real generation. This
  environment exposes a vidiq MCP server whose tools cover nearly every
  stage:

  | Stage | vidiq MCP tools |
  |---|---|
  | research | `vidiq_keyword_research`, `vidiq_trending_videos`, `vidiq_outliers`, `vidiq_youtube_search` |
  | script | *(Claude writes the script)* + `vidiq_generate_titles`, `vidiq_score_title` |
  | voiceover | `vidiq_voiceover_generate`, `vidiq_voiceover_clone` |
  | animation | `vidiq_generate_video`, `vidiq_generate_broll`, `vidiq_generate_clips` (async → `vidiq_job_poll`) |
  | thumbnail | `vidiq_generate_thumbnail`, `vidiq_refine_thumbnail`, `vidiq_score_thumbnail` |

### Agent-driven mode (using vidiq for real)

The vidiq tools are **MCP tools** — they're invoked by the Claude Code
agent at runtime, not callable from plain Python. So the `vidiq`
provider is a contract, not a network client: each method documents the
exact tool(s) to call and raises until wired. To produce a real video:

1. Run the pipeline under the Claude Code agent with `provider: vidiq`.
2. For each stage, the agent invokes the mapped MCP tool(s)
   (`pipeline/providers/vidiq.py` → `TOOL_MAP`).
3. The agent persists each stage's output through the same `RunState`,
   so resume, the manifest, and the post checklist all work unchanged.

This keeps one orchestration spine whether stages are faked locally or
generated for real.

## Configuration

See `config/pipeline.example.json`. Fields:

| Field | Meaning |
|---|---|
| `topic` *(required)* | What the video is about |
| `provider` | `mock` or `vidiq` |
| `output_dir` | Where run packages are written |
| `style`, `tone` | Creative direction for script/animation |
| `target_seconds` | Target length |
| `aspect_ratio` | e.g. `16:9` (long-form) or `9:16` (shorts/reels) |
| `voice` | Voiceover voice id (provider-specific) |
| `extra` | Free-form passthrough a provider can read |

## Roadmap

- Wire the `vidiq` provider to real MCP calls (agent-driven mode).
- Add a `publish` stage + `Publisher` interface (YouTube Data API,
  TikTok/Reels, or a scheduler) to close the loop from manual post to
  automated post.
- Parallelize independent stages (research / thumbnail) via the
  enabled agent-teams feature.
