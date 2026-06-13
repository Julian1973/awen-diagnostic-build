"""The real-generation seam, backed by the vidiq MCP tools.

This environment exposes a vidiq MCP server whose tools cover almost the
entire pipeline:

    research    -> vidiq_keyword_research, vidiq_trending_videos,
                   vidiq_outliers, vidiq_youtube_search
    script      -> (Claude writes the script) + vidiq_generate_titles,
                   vidiq_score_title
    voiceover   -> vidiq_voiceover_generate / vidiq_voiceover_clone
    animate     -> vidiq_generate_video, vidiq_generate_broll,
                   vidiq_generate_clips   (async; poll with vidiq_job_poll)
    thumbnail   -> vidiq_generate_thumbnail, vidiq_refine_thumbnail,
                   vidiq_score_thumbnail

Those tools are MCP tools — they're driven by the Claude Code agent at
runtime, not callable from plain Python. So this provider is the
*integration contract*: run the pipeline under the agent in "agent-driven"
mode (see README) and have it fill each stage by invoking the mapped MCP
tool, persisting outputs through the same RunState the orchestrator uses.

Until that wiring is in place, each method raises with the exact tool to
call, so the seam is unambiguous rather than silently fake.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, NoReturn

# Stage -> the MCP tool(s) the agent should invoke to satisfy it.
TOOL_MAP = {
    "research": ["vidiq_keyword_research", "vidiq_trending_videos", "vidiq_outliers"],
    "write_script": ["vidiq_generate_titles", "vidiq_score_title"],
    "voiceover": ["vidiq_voiceover_generate"],
    "animate": ["vidiq_generate_video", "vidiq_generate_broll", "vidiq_job_poll"],
    "thumbnail": ["vidiq_generate_thumbnail", "vidiq_score_thumbnail"],
    "assemble": ["vidiq_generate_clips"],
}


class VidiqProvider:
    name = "vidiq"

    def research(self, topic: str, config: Any) -> dict[str, Any]:
        self._seam("research")

    def write_script(self, research: dict[str, Any], config: Any) -> dict[str, Any]:
        self._seam("write_script")

    def voiceover(self, script: dict[str, Any], config: Any, out_dir: Path) -> dict[str, Any]:
        self._seam("voiceover")

    def animate(self, script: dict[str, Any], config: Any, out_dir: Path) -> dict[str, Any]:
        self._seam("animate")

    def thumbnail(self, script: dict[str, Any], config: Any, out_dir: Path) -> dict[str, Any]:
        self._seam("thumbnail")

    def assemble(self, animation, voiceover, config: Any, out_dir: Path) -> dict[str, Any]:
        self._seam("assemble")

    @staticmethod
    def _seam(stage: str) -> NoReturn:
        tools = ", ".join(TOOL_MAP.get(stage, []))
        raise NotImplementedError(
            f"vidiq stage '{stage}' is MCP-backed. Run under the Claude Code "
            f"agent and invoke: {tools}. See README 'Agent-driven mode'."
        )
