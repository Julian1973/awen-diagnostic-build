"""Pipeline stages, in execution order.

Each stage is a small callable that takes the provider, the config, the
accumulated results so far, and the run directory, and returns its own
result dict. Keeping them ordered and uniform is what lets the
orchestrator run, skip, and resume them generically.
"""

from __future__ import annotations

from .steps import STAGES, Stage

__all__ = ["STAGES", "Stage"]
