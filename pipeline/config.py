"""Run configuration loading.

Config is JSON so the pipeline stays dependency-free and runnable out of
the box. If PyYAML happens to be installed, ``.yaml``/``.yml`` files are
accepted too, but nothing here requires it.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class RunConfig:
    """Everything one pipeline run needs to know.

    ``topic`` is the only required field; the rest steer the creative and
    technical choices each stage makes.
    """

    topic: str
    provider: str = "mock"
    output_dir: str = "out"
    # Creative direction handed to the script/animation stages.
    style: str = "explainer"
    tone: str = "energetic"
    target_seconds: int = 60
    aspect_ratio: str = "16:9"
    voice: str | None = None
    # Free-form extras a provider may read (e.g. vidiq voice ids, model names).
    extra: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "RunConfig":
        known = {f.name for f in cls.__dataclass_fields__.values()}  # type: ignore[attr-defined]
        kwargs = {k: v for k, v in data.items() if k in known}
        extra = {k: v for k, v in data.items() if k not in known}
        if extra:
            kwargs.setdefault("extra", {}).update(extra)
        if "topic" not in kwargs:
            raise ValueError("config is missing required field: 'topic'")
        return cls(**kwargs)

    @classmethod
    def load(cls, path: str | Path) -> "RunConfig":
        path = Path(path)
        text = path.read_text(encoding="utf-8")
        if path.suffix in {".yaml", ".yml"}:
            data = _load_yaml(text)
        else:
            data = json.loads(text)
        if not isinstance(data, dict):
            raise ValueError(f"config must be a mapping, got {type(data).__name__}")
        return cls.from_dict(data)


def _load_yaml(text: str) -> dict[str, Any]:
    try:
        import yaml  # type: ignore
    except ModuleNotFoundError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "YAML config requires PyYAML (pip install pyyaml), or use JSON instead."
        ) from exc
    return yaml.safe_load(text)
