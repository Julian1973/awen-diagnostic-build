"""Provider contract.

A Provider is the thing that actually *generates* — research, script,
voiceover, video, thumbnail. The orchestrator only knows this interface,
so the same pipeline runs against the mock (for development) or against
real generation services without any stage code changing.

Methods return plain dicts/paths so results serialize cleanly into the
run state and manifest.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol


class Provider(Protocol):
    name: str

    def research(self, topic: str, config: Any) -> dict[str, Any]:
        """Find the angle: keywords, comparable videos, a hook."""

    def write_script(self, research: dict[str, Any], config: Any) -> dict[str, Any]:
        """Produce title(s), description, tags, and a scene-by-scene script."""

    def voiceover(self, script: dict[str, Any], config: Any, out_dir: Path) -> dict[str, Any]:
        """Narrate the script to an audio file."""

    def animate(self, script: dict[str, Any], config: Any, out_dir: Path) -> dict[str, Any]:
        """Generate a video clip per scene from its visual prompt."""

    def thumbnail(self, script: dict[str, Any], config: Any, out_dir: Path) -> dict[str, Any]:
        """Generate (and score) a thumbnail."""

    def assemble(
        self,
        animation: dict[str, Any],
        voiceover: dict[str, Any],
        config: Any,
        out_dir: Path,
    ) -> dict[str, Any]:
        """Mux clips + narration into one final video file."""
