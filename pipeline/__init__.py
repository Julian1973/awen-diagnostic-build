"""AI animation pipeline: script -> review-ready package.

A config-driven orchestrator that chains the stages of an AI video
production run (research -> script -> voiceover -> animation -> thumbnail
-> assemble) and produces a review-ready package for manual posting.

Generation work is delegated to a Provider (see ``pipeline.providers``).
The bundled ``MockProvider`` produces placeholder assets so the whole
flow is runnable with no external services; the ``VidiqProvider`` marks
the seam where the real (MCP-backed) generation is wired in.
"""

__all__ = ["__version__"]

__version__ = "0.1.0"
