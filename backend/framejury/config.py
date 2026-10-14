from __future__ import annotations

import os
from dataclasses import dataclass, field, replace

RAW_EXTENSIONS = {
    ".cr2", ".cr3", ".nef", ".nrw", ".arw", ".srf", ".sr2",
    ".dng", ".raf", ".orf", ".rw2", ".pef", ".srw",
}
STANDARD_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
IMAGE_EXTENSIONS = STANDARD_EXTENSIONS | RAW_EXTENSIONS

FILE_KINDS = {
    "jpeg": {".jpg", ".jpeg"},
    "png": {".png"},
    "webp": {".webp"},
    "raw": RAW_EXTENSIONS,
}
KIND_LABELS = {"jpeg": "JPEG", "png": "PNG", "webp": "WebP", "raw": "RAW"}

CRITERIA = {
    "sharpness": {
        "label": "Sharpness",
        "hint": "Penalizes shots that are softer than a near-duplicate.",
        "needs_model": False,
    },
    "exposure": {
        "label": "Exposure",
        "hint": "Flags blown highlights and crushed shadows.",
        "needs_model": False,
    },
    "eyes": {
        "label": "Closed eyes",
        "hint": "Asks the vision model to spot closed or half-closed eyes.",
        "needs_model": True,
    },
    "focus": {
        "label": "Subject focus",
        "hint": "Asks the vision model how crisp the main subject's face is.",
        "needs_model": True,
    },
    "expression": {
        "label": "Expression",
        "hint": "Asks the vision model about awkward or mid-word expressions.",
        "needs_model": True,
    },
}
VISION_CRITERIA = frozenset(k for k, v in CRITERIA.items() if v["needs_model"])

BOUNDS = {
    "group_gap_seconds": {"min": 1.0, "max": 600.0, "step": 1.0, "label": "Time between shots",
                          "hint": "Photos taken further apart than this never share a group (seconds)."},
    "group_hash_distance": {"min": 0, "max": 40, "step": 1, "label": "Visual similarity",
                            "hint": "Higher groups looser matches together. Lower needs near-identical frames."},
    "shortlist_size": {"min": 2, "max": 6, "step": 1, "label": "Candidates per group",
                       "hint": "How many of the sharpest shots the model compares at once."},
    "soft_ratio": {"min": 0.3, "max": 0.95, "step": 0.05, "label": "Sharpness strictness",
                   "hint": "A shot below this share of the sharpest one is marked as soft."},
}


def _env_int(name: str, default: int) -> int:
    value = os.environ.get(name)
    return int(value) if value else default


def _env_float(name: str, default: float) -> float:
    value = os.environ.get(name)
    return float(value) if value else default


@dataclass(frozen=True)
class Settings:
    ollama_url: str = field(default_factory=lambda: os.environ.get("FRAMEJURY_OLLAMA_URL", "http://localhost:11434"))
    model: str = field(default_factory=lambda: os.environ.get("FRAMEJURY_MODEL", "gemma4:e4b-it-qat"))
    request_timeout: float = field(default_factory=lambda: _env_float("FRAMEJURY_TIMEOUT", 300.0))
    keep_alive: str = "30m"
    vision_max_side: int = field(default_factory=lambda: _env_int("FRAMEJURY_VISION_SIDE", 1024))
    group_gap_seconds: float = field(default_factory=lambda: _env_float("FRAMEJURY_GAP_SECONDS", 12.0))
    group_hash_distance: int = field(default_factory=lambda: _env_int("FRAMEJURY_HASH_DISTANCE", 24))
    shortlist_size: int = field(default_factory=lambda: _env_int("FRAMEJURY_SHORTLIST", 4))
    soft_ratio: float = field(default_factory=lambda: _env_float("FRAMEJURY_SOFT_RATIO", 0.6))
    clipped_high_limit: float = 0.25
    clipped_low_limit: float = 0.40
    vision_singles: bool = True
    criteria: frozenset = frozenset(CRITERIA)
    kinds: frozenset = frozenset(FILE_KINDS)
    recursive: bool = False
    exclude: tuple = ()

    def extensions(self) -> set[str]:
        found: set[str] = set()
        for kind in self.kinds:
            found |= FILE_KINDS[kind]
        return found

    def uses_model(self) -> bool:
        return bool(VISION_CRITERIA & self.criteria)


def _clamp(value, low, high):
    return max(low, min(high, value))


def build_settings(base: Settings, options: dict | None) -> Settings:
    options = options or {}
    changes: dict = {}

    model = options.get("model")
    if model is not None:
        model = str(model).strip()
        if not model:
            raise ValueError("The model name cannot be empty")
        changes["model"] = model

    for key, spec in BOUNDS.items():
        raw = options.get(key)
        if raw is None:
            continue
        try:
            number = float(raw)
        except (TypeError, ValueError) as error:
            raise ValueError(f"{key} must be a number") from error
        number = _clamp(number, spec["min"], spec["max"])
        changes[key] = number if key in ("group_gap_seconds", "soft_ratio") else int(round(number))

    criteria = options.get("criteria")
    if criteria is not None:
        chosen = frozenset(criteria)
        unknown = chosen - set(CRITERIA)
        if unknown:
            raise ValueError(f"Unknown criteria: {', '.join(sorted(unknown))}")
        if not chosen:
            raise ValueError("Pick at least one criterion to evaluate")
        changes["criteria"] = chosen

    kinds = options.get("kinds")
    if kinds is not None:
        chosen_kinds = frozenset(kinds)
        unknown = chosen_kinds - set(FILE_KINDS)
        if unknown:
            raise ValueError(f"Unknown file types: {', '.join(sorted(unknown))}")
        if not chosen_kinds:
            raise ValueError("Pick at least one file type")
        changes["kinds"] = chosen_kinds

    if options.get("recursive") is not None:
        changes["recursive"] = bool(options["recursive"])

    exclude = options.get("exclude")
    if exclude is not None:
        patterns = tuple(str(p).strip() for p in exclude if str(p).strip())
        if len(patterns) > 20:
            raise ValueError("Use at most 20 exclusion patterns")
        changes["exclude"] = patterns

    return replace(base, **changes)