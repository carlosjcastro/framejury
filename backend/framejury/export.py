from __future__ import annotations

import csv
import io
import shutil
from pathlib import Path

from .config import IMAGE_EXTENSIONS

FOLDER_NAMES = {"keep": "Keep", "review": "Review", "reject": "Reject"}
XMP_LABELS = {"keep": "Green", "review": "Yellow", "reject": "Red"}

CSV_COLUMNS = [
    "group", "file", "decision", "original_decision", "changed_by_user", "reason",
    "sharpness", "sharpness_pct_of_group_best", "bright_clipped_pct", "dark_clipped_pct",
    "eyes_closed", "subject_focus", "expression", "model_note", "path",
]


def iter_photos(report: dict):
    for group in report["groups"]:
        top = max((p["metrics"]["sharpness"] for p in group["photos"]), default=1) or 1
        for photo in group["photos"]:
            yield group, photo, top


def to_csv(report: dict) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(CSV_COLUMNS)
    for group, photo, top in iter_photos(report):
        metrics = photo["metrics"]
        obs = photo.get("observation") or {}
        writer.writerow([
            group["id"], photo["name"], photo["status"],
            photo.get("auto_status", photo["status"]), "yes" if photo.get("manual") else "no",
            photo["reason"], round(metrics["sharpness"], 1),
            round(metrics["sharpness"] / top * 100), round(metrics["clipped_high"] * 100, 1),
            round(metrics["clipped_low"] * 100, 1), obs.get("closed_eyes", ""),
            obs.get("subject_focus", ""), obs.get("expression", ""), obs.get("note", ""), photo["path"],
        ])
    return buffer.getvalue()


def companions(path: Path) -> list[Path]:
    stem = path.stem.lower()
    found = []
    for other in path.parent.iterdir():
        if other == path or not other.is_file() or other.stem.lower() != stem:
            continue
        if other.suffix.lower() in IMAGE_EXTENSIONS or other.suffix.lower() == ".xmp":
            found.append(other)
    return sorted(found)


def _unique(target: Path) -> Path:
    if not target.exists():
        return target
    for number in range(2, 10000):
        candidate = target.with_name(f"{target.stem}_{number}{target.suffix}")
        if not candidate.exists():
            return candidate
    raise RuntimeError(f"Too many files named {target.name}")


def export_folders(report: dict, destination: str | Path | None, include_rejects: bool = False) -> dict:
    root = Path(destination) if destination else Path(report["folder"]) / "framejury-export"
    source_root = Path(report["folder"]).resolve()
    if root.resolve() == source_root:
        raise ValueError("The destination must be a different folder from the photos")
    wanted = ("keep", "review", "reject") if include_rejects else ("keep", "review")
    counts = {"keep": 0, "review": 0, "reject": 0}
    for _, photo, _ in iter_photos(report):
        status = photo["status"]
        if status not in wanted:
            continue
        source = Path(photo["path"])
        if not source.is_file():
            continue
        target_dir = root / FOLDER_NAMES[status]
        target_dir.mkdir(parents=True, exist_ok=True)
        for file in [source, *companions(source)]:
            shutil.copy2(file, _unique(target_dir / file.name))
        counts[status] += 1
    return {"destination": str(root.resolve()), "copied": counts}


def xmp_document(status: str) -> str:
    attributes = f'xmp:Label="{XMP_LABELS[status]}"'
    if status == "reject":
        attributes += ' xmp:Rating="-1"'
    return (
        '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n'
        '<x:xmpmeta xmlns:x="adobe:ns:meta/">\n'
        ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n'
        '  <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/" '
        f"{attributes}/>\n"
        " </rdf:RDF>\n"
        "</x:xmpmeta>\n"
        '<?xpacket end="w"?>\n'
    )


def write_xmp(report: dict) -> dict:
    written = skipped_existing = missing = 0
    for _, photo, _ in iter_photos(report):
        source = Path(photo["path"])
        if not source.is_file():
            missing += 1
            continue
        sidecar = source.with_suffix(".xmp")
        if sidecar.exists():
            skipped_existing += 1
            continue
        sidecar.write_text(xmp_document(photo["status"]), encoding="utf-8")
        written += 1
    return {"written": written, "skipped_existing": skipped_existing, "missing": missing}
