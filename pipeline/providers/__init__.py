"""Provider registry."""

from __future__ import annotations

from typing import Any

from .base import Provider
from .mock import MockProvider
from .vidiq import VidiqProvider

_PROVIDERS = {
    MockProvider.name: MockProvider,
    VidiqProvider.name: VidiqProvider,
}


def get_provider(name: str) -> Provider:
    try:
        return _PROVIDERS[name]()
    except KeyError:
        known = ", ".join(sorted(_PROVIDERS))
        raise ValueError(f"unknown provider '{name}'. Known: {known}") from None


__all__ = ["Provider", "MockProvider", "VidiqProvider", "get_provider"]
