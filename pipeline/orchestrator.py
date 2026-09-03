"""Runs the stages in order, with resume and per-stage skipping.

The orchestrator is deliberately dumb: it owns directories, ordering,
state, and the manifest, and delegates all generation to the provider. A
failed run can be re-invoked and will pick up from the first incomplete
stage (unless ``force`` re-runs everything).
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Callable

from .config import RunConfig
from .manifest import write_manifest
from .providers import get_provider
from .stages import STAGES
from .state import RunState

Reporter = Callable[[str], None]


def run(
    config: RunConfig,
    *,
    force: bool = False,
    report: Reporter | None = None,
) -> Path:
    """Execute the pipeline and return the run directory."""
    say = report or (lambda _msg: None)

    run_dir = _run_dir(config)
    assets_dir = run_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    provider = get_provider(config.provider)
    state = RunState.load_or_create(run_dir)
    say(f"Run directory: {run_dir}  (provider: {provider.name})")

    results: dict[str, Any] = {}
    for stage in STAGES:
        if force:
            state.reset(stage.name)
        if state.is_done(stage.name):
            results[stage.name] = state.output(stage.name)
            say(f"  [skip] {stage.name} (already done)")
            continue

        say(f"  [run ] {stage.name}: {stage.description}")
        output = stage.run(provider, config, results, assets_dir)
        results[stage.name] = output
        state.record(stage.name, output)

    manifest_path = write_manifest(run_dir, config, results)
    say(f"Package ready: {manifest_path}")
    say(f"Next: review {run_dir / 'POST_CHECKLIST.md'} and post manually.")
    return run_dir


def _run_dir(config: RunConfig) -> Path:
    slug = re.sub(r"[^a-z0-9]+", "-", config.topic.lower()).strip("-") or "run"
    return Path(config.output_dir) / slug
