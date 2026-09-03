"""Run state: makes a pipeline run resumable.

Each stage records its completion and its outputs in ``state.json`` inside
the run directory. Re-running skips already-completed stages unless the
caller forces a rerun, so an expensive render job is never repeated just
because a later stage failed.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any


class RunState:
    def __init__(self, path: Path, data: dict[str, Any] | None = None) -> None:
        self.path = path
        self.data: dict[str, Any] = data or {"stages": {}, "started_at": _now()}

    @classmethod
    def load_or_create(cls, run_dir: Path) -> "RunState":
        path = run_dir / "state.json"
        if path.exists():
            return cls(path, json.loads(path.read_text(encoding="utf-8")))
        run_dir.mkdir(parents=True, exist_ok=True)
        state = cls(path)
        state.save()
        return state

    def is_done(self, stage: str) -> bool:
        return self.data["stages"].get(stage, {}).get("status") == "done"

    def output(self, stage: str) -> Any:
        return self.data["stages"].get(stage, {}).get("output")

    def record(self, stage: str, output: Any) -> None:
        self.data["stages"][stage] = {
            "status": "done",
            "finished_at": _now(),
            "output": output,
        }
        self.save()

    def reset(self, stage: str) -> None:
        self.data["stages"].pop(stage, None)
        self.save()

    def save(self) -> None:
        self.path.write_text(
            json.dumps(self.data, indent=2, ensure_ascii=False), encoding="utf-8"
        )


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
