from __future__ import annotations

import base64
import io
import json
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import httpx

from .config import Settings
from .metrics import load_rgb

SCHEMA = {
    "type": "object",
    "properties": {
        "photos": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "index": {"type": "integer"},
                    "people": {"type": "integer"},
                    "closed_eyes": {"type": "integer"},
                    "expression": {"type": "integer"},
                    "subject_focus": {"type": "integer"},
                    "note": {"type": "string"},
                },
                "required": ["index", "people", "closed_eyes", "expression", "subject_focus", "note"],
            },
        },
        "best": {"type": "integer"},
        "best_reason": {"type": "string"},
    },
    "required": ["photos", "best", "best_reason"],
}


class VisionError(RuntimeError):
    """A model problem. `code` lets the interface explain it and say what to do."""

    def __init__(self, message: str, code: str = "model_error", model: str | None = None):
        super().__init__(message)
        self.code = code
        self.model = model


@dataclass
class Observation:
    people: int
    closed_eyes: int
    expression: int
    subject_focus: int
    note: str


@dataclass
class Verdict:
    observations: list[Observation]
    best_index: int
    best_reason: str
    seconds: float


class Vision(Protocol):
    def judge(self, paths: list[str], lang: str) -> Verdict: ...


def encode_image(path: str | Path, max_side: int) -> str:
    image = load_rgb(path)
    image.thumbnail((max_side, max_side))
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=85)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def build_prompt(count: int, lang: str) -> str:
    language = "Spanish" if lang == "es" else "English"
    scope = (
        f"You will see {count} nearly identical photos from the same moment, numbered 1 to {count} in the order shown."
        if count > 1
        else "You will see 1 photo, numbered 1."
    )
    return (
        "You are assisting an event photographer who is culling photos. "
        f"{scope} Report only what is visible and be strict about technical flaws. "
        "For each photo give: people (number of visible people); "
        "closed_eyes (how many visible people have their eyes closed or mid-blink, 0 if none); "
        "expression (1 to 5, where 1 is awkward or mid-word and 5 is natural and flattering); "
        "subject_focus (1 to 5, how crisp the main subject's face is, where 1 is clearly out of focus or motion blurred); "
        f"note (one short factual sentence in {language} about the most important defect of that photo, "
        "or its best quality if it has no defect). "
        f"Then give best, the number of the photo you would keep, and best_reason, one sentence in {language} "
        "that says what is good about the chosen photo. "
        "If the photos are almost the same, decide on small differences in eyes, expression and focus. "
        "Do not value artistic mood over technical quality. "
        "In note and best_reason never refer to photos by number or position and never compare one photo "
        'with another, so do not use words such as "first", "second", "other" or "both". '
        "Describe only what is visible in the photo itself."
    )


_POSITION = re.compile(
    r"\b(?:first|second|third|fourth|fifth|other|another)\s+(?:image|photo|picture|shot|frame|one|version)\b"
    r"|\b(?:both|all)\s+(?:the\s+)?(?:images|photos|pictures|shots|frames)\b"
    r"|\b(?:image|photo|picture|shot|frame)\s+#?\d\b"
    r"|\b(?:primera|segunda|tercera|cuarta|quinta|otra)\s+(?:imagen|foto|toma|versi[oó]n)\b"
    r"|\b(?:ambas|las dos)\s+(?:im[aá]genes|fotos|tomas)\b"
    r"|\b(?:imagen|foto|toma)\s+#?\d\b",
    re.IGNORECASE,
)


def refers_to_position(text: str) -> bool:
    """True when the model points at a photo by order ("the second image"), which means nothing to a reader."""
    return bool(_POSITION.search(text))


def _readable(text: str) -> str:
    return "" if refers_to_position(text) else text


def _clamp(value: object, low: int, high: int) -> int:
    try:
        return max(low, min(high, int(value)))
    except (TypeError, ValueError):
        return low


def parse_response(content: str, count: int) -> tuple[list[Observation], int, str]:
    try:
        data = json.loads(content)
        entries = {int(entry["index"]): entry for entry in data["photos"]}
        observations = []
        for position in range(1, count + 1):
            entry = entries[position]
            observations.append(
                Observation(
                    people=_clamp(entry["people"], 0, 50),
                    closed_eyes=_clamp(entry["closed_eyes"], 0, 50),
                    expression=_clamp(entry["expression"], 1, 5),
                    subject_focus=_clamp(entry["subject_focus"], 1, 5),
                    note=_readable(str(entry["note"]).strip()),
                )
            )
        best = _clamp(data["best"], 1, count) - 1
        return observations, best, _readable(str(data["best_reason"]).strip())
    except (KeyError, ValueError, TypeError) as error:
        raise VisionError(f"Unusable model response: {error}") from error


class OllamaVision:
    def __init__(self, settings: Settings, client: httpx.Client | None = None, attempts: int = 2):
        self.settings = settings
        self.client = client or httpx.Client(timeout=settings.request_timeout)
        self.attempts = attempts

    def check(self) -> None:
        try:
            response = self.client.get(f"{self.settings.ollama_url}/api/tags")
            response.raise_for_status()
        except httpx.HTTPError as error:
            raise VisionError(
                f"Cannot reach Ollama at {self.settings.ollama_url}. Is it running? ({error})",
                code="ollama_down",
            ) from error
        names = {model.get("name", "") for model in response.json().get("models", [])}
        wanted = self.settings.model
        if wanted not in names and f"{wanted}:latest" not in names:
            raise VisionError(
                f"Model '{wanted}' is not installed. Run: ollama pull {wanted}",
                code="model_missing",
                model=wanted,
            )

    def ask(self, prompt: str, schema: dict) -> dict:
        """Text-only question with a structured answer."""
        payload = {
            "model": self.settings.model,
            "stream": False,
            "think": False,
            "format": schema,
            "keep_alive": self.settings.keep_alive,
            "options": {"temperature": 0.2},
            "messages": [{"role": "user", "content": prompt}],
        }
        last_error: Exception | None = None
        for _ in range(self.attempts):
            try:
                response = self.client.post(f"{self.settings.ollama_url}/api/chat", json=payload)
                response.raise_for_status()
                return json.loads(response.json()["message"]["content"])
            except (httpx.HTTPError, KeyError, ValueError) as error:
                last_error = error
        raise VisionError(f"Unusable model response: {last_error}")

    def models(self) -> list[dict]:
        """Installed models with their capabilities, vision-capable ones flagged."""
        try:
            response = self.client.get(f"{self.settings.ollama_url}/api/tags")
            response.raise_for_status()
        except httpx.HTTPError as error:
            raise VisionError(
                f"Cannot reach Ollama at {self.settings.ollama_url}. ({error})", code="ollama_down"
            ) from error
        found = []
        for model in response.json().get("models", []):
            name = model.get("name", "")
            vision = None
            try:
                shown = self.client.post(f"{self.settings.ollama_url}/api/show", json={"model": name})
                shown.raise_for_status()
                vision = "vision" in shown.json().get("capabilities", [])
            except (httpx.HTTPError, ValueError):
                pass
            found.append({"name": name, "vision": vision})
        return sorted(found, key=lambda m: (m["vision"] is not True, m["name"]))

    def judge(self, paths: list[str], lang: str) -> Verdict:
        images = [encode_image(path, self.settings.vision_max_side) for path in paths]
        payload = {
            "model": self.settings.model,
            "stream": False,
            "think": False,
            "format": SCHEMA,
            "keep_alive": self.settings.keep_alive,
            "options": {"temperature": 0},
            "messages": [{"role": "user", "content": build_prompt(len(paths), lang), "images": images}],
        }
        last_error: Exception | None = None
        for _ in range(self.attempts):
            started = time.perf_counter()
            try:
                response = self.client.post(f"{self.settings.ollama_url}/api/chat", json=payload)
                response.raise_for_status()
                content = response.json()["message"]["content"]
                observations, best, reason = parse_response(content, len(paths))
                return Verdict(observations, best, reason, time.perf_counter() - started)
            except (httpx.HTTPError, KeyError, ValueError, VisionError) as error:
                last_error = error
        raise VisionError(str(last_error))