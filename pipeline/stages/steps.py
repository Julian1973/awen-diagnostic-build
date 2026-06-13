"""The ordered stage definitions.

A Stage pairs a name with the function that runs it. The function reads
whatever upstream results it needs out of ``results`` and returns its own
result dict, which the orchestrator stores in state under the stage name.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

StageFn = Callable[[Any, Any, dict[str, Any], Path], dict[str, Any]]


@dataclass(frozen=True)
class Stage:
    name: str
    run: StageFn
    description: str


def _research(provider, config, results, assets_dir) -> dict[str, Any]:
    return provider.research(config.topic, config)


def _script(provider, config, results, assets_dir) -> dict[str, Any]:
    return provider.write_script(results["research"], config)


def _voiceover(provider, config, results, assets_dir) -> dict[str, Any]:
    return provider.voiceover(results["script"], config, assets_dir)


def _animation(provider, config, results, assets_dir) -> dict[str, Any]:
    return provider.animate(results["script"], config, assets_dir)


def _thumbnail(provider, config, results, assets_dir) -> dict[str, Any]:
    return provider.thumbnail(results["script"], config, assets_dir)


def _assemble(provider, config, results, assets_dir) -> dict[str, Any]:
    return provider.assemble(results["animation"], results["voiceover"], config, assets_dir)


STAGES: list[Stage] = [
    Stage("research", _research, "Find the angle, keywords, and hook"),
    Stage("script", _script, "Write title, description, tags, and scene script"),
    Stage("voiceover", _voiceover, "Narrate the script to audio"),
    Stage("animation", _animation, "Generate a video clip per scene"),
    Stage("thumbnail", _thumbnail, "Generate and score a thumbnail"),
    Stage("assemble", _assemble, "Mux clips + narration into the final video"),
]
