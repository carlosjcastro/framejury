from __future__ import annotations

import fnmatch
import json
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from pathlib import Path
from typing import Callable

from . import __version__
from .config import FILE_KINDS, RAW_EXTENSIONS, Settings
from .decision import GroupDecision, decide
from .grouping import group_photos
from .metrics import PhotoInfo, analyze_file
from .vision import Observation, Verdict, Vision, VisionError

Progress = Callable[[str, int, int], None]


def _excluded(relative: str, patterns: tuple[str, ...]) -> bool:
    lowered = relative.lower()
    base = lowered.rsplit("/", 1)[-1]
    return any(
        fnmatch.fnmatch(lowered, pattern.lower()) or fnmatch.fnmatch(base, pattern.lower())
        for pattern in patterns
    )


def scan_folder(folder: str | Path, settings: Settings | None = None) -> list[tuple[Path, str]]:
    """Return (path, relative_name) pairs. Names use forward slashes so they are stable across systems."""
    settings = settings or Settings()
    root = Path(folder)
    if not root.is_dir():
        raise FileNotFoundError(f"Folder not found: {root}")
    allowed = settings.extensions()
    walker = root.rglob("*") if settings.recursive else root.iterdir()
    files = []
    for path in walker:
        if not path.is_file() or path.suffix.lower() not in allowed:
            continue
        if any(part.startswith(".") for part in path.relative_to(root).parts):
            continue
        relative = path.relative_to(root).as_posix()
        if _excluded(relative, settings.exclude):
            continue
        files.append((path, relative))
    raw_stems = {(p.parent, p.stem.lower()) for p, _ in files if p.suffix.lower() in RAW_EXTENSIONS}
    primary = [
        (p, rel) for p, rel in files
        if p.suffix.lower() in RAW_EXTENSIONS or (p.parent, p.stem.lower()) not in raw_stems
    ]
    return sorted(primary, key=lambda item: item[1].lower())


def kind_of(path: Path) -> str:
    suffix = path.suffix.lower()
    for kind, extensions in FILE_KINDS.items():
        if suffix in extensions:
            return kind
    return "other"


def _analyze_all(items: list[tuple[Path, str]], progress: Progress | None) -> tuple[list[PhotoInfo], list[dict]]:
    infos: list[PhotoInfo] = []
    skipped: list[dict] = []

    def work(item: tuple[Path, str]):
        path, name = item
        try:
            return analyze_file(path, name), None
        except Exception as error:  # unreadable or corrupt file
            return None, {"name": name, "error": str(error)}

    done = 0
    with ThreadPoolExecutor(max_workers=4) as pool:
        for info, error in pool.map(work, items):
            done += 1
            if info:
                infos.append(info)
            else:
                skipped.append(error)
            if progress:
                progress("analyze", done, len(items))
    return infos, skipped


def _judge_group(vision: Vision, shortlist: list[PhotoInfo], lang: str):
    paths = [p.path for p in shortlist]
    first = vision.judge(paths, lang)
    if len(shortlist) < 2:
        return first.observations, shortlist[first.best_index].name, first.best_reason, first.seconds
    second = vision.judge(paths[::-1], lang)
    second_obs = second.observations[::-1]
    second_best = len(shortlist) - 1 - second.best_index
    merged = [
        Observation(
            people=a.people,
            closed_eyes=max(a.closed_eyes, b.closed_eyes),
            expression=min(a.expression, b.expression),
            subject_focus=min(a.subject_focus, b.subject_focus),
            note=a.note,
        )
        for a, b in zip(first.observations, second_obs)
    ]
    agreed = first.best_index == second_best
    best_name = shortlist[first.best_index].name if agreed else None
    reason = first.best_reason if agreed else None
    return merged, best_name, reason, first.seconds + second.seconds


def _photo_dict(decision, info_by_name: dict[str, PhotoInfo]) -> dict:
    info = info_by_name[decision.name]
    return {
        "name": decision.name,
        "path": decision.path,
        "status": decision.status,
        "reason": decision.reason,
        "flags": decision.flags,
        "score": round(decision.score, 1),
        "observation": asdict(decision.observation) if decision.observation else None,
        "metrics": {
            "sharpness": round(info.sharpness, 1),
            "brightness": round(info.brightness, 3),
            "clipped_high": round(info.clipped_high, 3),
            "clipped_low": round(info.clipped_low, 3),
            "width": info.width,
            "height": info.height,
            "taken_at": info.taken_at,
        },
    }


def run(
    folder: str | Path,
    settings: Settings,
    vision: Vision | None,
    lang: str = "en",
    progress: Progress | None = None,
    note: Callable[[str], None] | None = None,
    only: list[str] | None = None,
    single_group: bool = False,
) -> dict:
    started = time.perf_counter()
    if note:
        note("Measuring sharpness, exposure and capture time")
    items = scan_folder(folder, settings)
    if only is not None:
        wanted = set(only)
        items = [item for item in items if item[1] in wanted]
        if not items:
            raise ValueError("None of the selected photos were found with the current filters")
    infos, skipped = _analyze_all(items, progress)
    info_by_name = {i.name: i for i in infos}
    if single_group and infos:
        groups = [sorted(infos, key=lambda p: (p.taken_at, p.name))]
    else:
        groups = group_photos(infos, settings.group_gap_seconds, settings.group_hash_distance)
    if vision is not None and not settings.uses_model():
        vision = None

    results: list[GroupDecision] = []
    model_calls = 0
    model_seconds = 0.0

    for position, members in enumerate(groups, start=1):
        ranked = sorted(members, key=lambda p: p.sharpness, reverse=True)
        shortlist = ranked[: settings.shortlist_size]
        shortlist_names = [p.name for p in shortlist]
        use_vision = vision is not None and (len(members) > 1 or settings.vision_singles)

        if note and use_vision:
            names = [p.name for p in shortlist]
            note(f"Checking {names[0]}" if len(names) == 1 else "Comparing " + ", ".join(names))
        observations = {}
        best_name = None
        best_reason = None
        error = None
        if use_vision:
            try:
                merged, best_name, best_reason, seconds = _judge_group(vision, shortlist, lang)
                model_calls += 1 if len(shortlist) < 2 else 2
                model_seconds += seconds
                for photo, observation in zip(shortlist, merged):
                    observations[photo.name] = observation
            except VisionError as exc:
                error = str(exc)

        results.append(
            decide(members, shortlist_names, observations, best_name, best_reason, settings, lang, error)
        )
        if progress:
            progress("judge", position, len(groups))

    if note:
        note("Applying decision rules")
    out_groups = []
    counts = {"keep": 0, "reject": 0, "review": 0}
    for number, result in enumerate(results, start=1):
        photos = [_photo_dict(p, info_by_name) for p in sorted(result.photos, key=lambda p: -p.score)]
        for p in photos:
            counts[p["status"]] += 1
        out_groups.append(
            {
                "id": number,
                "keeper": result.keeper,
                "needs_review": result.needs_review,
                "vision_error": result.vision_error,
                "photos": photos,
            }
        )

    return {
        "version": __version__,
        "folder": str(Path(folder).resolve()),
        "model": settings.model if vision else None,
        "lang": lang,
        "options": {
            "recursive": settings.recursive,
            "kinds": sorted(settings.kinds),
            "criteria": sorted(settings.criteria),
            "exclude": list(settings.exclude),
            "compared_selection": single_group,
            "selected_only": only is not None,
            "group_gap_seconds": settings.group_gap_seconds,
            "group_hash_distance": settings.group_hash_distance,
            "shortlist_size": settings.shortlist_size,
            "soft_ratio": settings.soft_ratio,
        },
        "stats": {
            "photos": len(infos),
            "groups": len(groups),
            **counts,
            "model_calls": model_calls,
            "model_seconds": round(model_seconds, 1),
            "total_seconds": round(time.perf_counter() - started, 1),
        },
        "groups": out_groups,
        "skipped": skipped,
    }


def write_outputs(report: dict, out_dir: str | Path) -> dict[str, Path]:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    buckets: dict[str, list[str]] = {"keep": [], "reject": [], "review": []}
    for group in report["groups"]:
        for photo in group["photos"]:
            buckets[photo["status"]].append(photo["name"])
    files = {
        "report": out / "report.json",
        "keepers": out / "keepers.txt",
        "rejects": out / "rejects.txt",
        "review": out / "review.txt",
    }
    files["report"].write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    files["keepers"].write_text("\n".join(sorted(buckets["keep"])) + "\n", encoding="utf-8")
    files["rejects"].write_text("\n".join(sorted(buckets["reject"])) + "\n", encoding="utf-8")
    files["review"].write_text("\n".join(sorted(buckets["review"])) + "\n", encoding="utf-8")
    return files