from __future__ import annotations

import os
from dataclasses import dataclass, field

RAW_EXTENSIONS = {
    ".cr2", ".cr3", ".nef", ".nrw", ".arw", ".srf", ".sr2",
    ".dng", ".raf", ".orf", ".rw2", ".pef", ".srw",
}
STANDARD_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
IMAGE_EXTENSIONS = STANDARD_EXTENSIONS | RAW_EXTENSIONS


def _env_int(name: str, default: int) -> int:
    value = os.environ.get(name)
    return int(value) if value else default


def _env_float(name: str, default: float) -> float:
    value = os.environ.get(name)
    return float(value) if value else default


@dataclass(frozen=True)
class Settings:
    ollama_url: str = field(default_factory=lambda: os.environ.get("KEEPER_OLLAMA_URL", "http://localhost:11434"))
    model: str = field(default_factory=lambda: os.environ.get("KEEPER_MODEL", "gemma4:e4b-it-qat"))
    request_timeout: float = field(default_factory=lambda: _env_float("KEEPER_TIMEOUT", 300.0))
    keep_alive: str = "30m"
    vision_max_side: int = field(default_factory=lambda: _env_int("KEEPER_VISION_SIDE", 1024))
    group_gap_seconds: float = field(default_factory=lambda: _env_float("KEEPER_GAP_SECONDS", 12.0))
    group_hash_distance: int = field(default_factory=lambda: _env_int("KEEPER_HASH_DISTANCE", 24))
    shortlist_size: int = field(default_factory=lambda: _env_int("KEEPER_SHORTLIST", 4))
    soft_ratio: float = field(default_factory=lambda: _env_float("KEEPER_SOFT_RATIO", 0.6))
    clipped_high_limit: float = 0.25
    clipped_low_limit: float = 0.40
    vision_singles: bool = True
