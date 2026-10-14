from __future__ import annotations

import argparse
import sys
from dataclasses import replace
from pathlib import Path

from .config import Settings, build_settings
from .pipeline import run, write_outputs
from .vision import OllamaVision, VisionError


def _progress(stage: str, done: int, total: int) -> None:
    label = "Analyzing" if stage == "analyze" else "Judging groups"
    print(f"\r{label}: {done}/{total}", end="", file=sys.stderr, flush=True)
    if done == total:
        print(file=sys.stderr)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="keeper", description="Local photo culling that explains its decisions.")
    sub = parser.add_subparsers(dest="command", required=True)

    analyze = sub.add_parser("analyze", help="Analyze a folder of photos")
    analyze.add_argument("folder")
    analyze.add_argument("--model")
    analyze.add_argument("--lang", choices=["en", "es"], default="en")
    analyze.add_argument("--out", default="keeper_out")
    analyze.add_argument("--no-vision", action="store_true", help="Metrics only, no model")
    analyze.add_argument("--no-singles", action="store_true", help="Do not send single photos to the model")
    analyze.add_argument("--shortlist", type=int)
    analyze.add_argument("--recursive", action="store_true", help="Include subfolders")
    analyze.add_argument("--exclude", action="append", default=[], metavar="PATTERN",
                         help="Skip files matching a pattern such as '*draft*' (repeatable)")
    analyze.add_argument("--kinds", help="Comma list: jpeg,png,webp,raw")
    analyze.add_argument("--criteria", help="Comma list: sharpness,exposure,eyes,focus,expression")

    sub.add_parser("check", help="Check that Ollama and the model are available")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    settings = Settings()

    if args.command == "check":
        try:
            OllamaVision(settings).check()
        except VisionError as error:
            print(f"FAIL: {error}")
            return 1
        print(f"OK: Ollama reachable and model '{settings.model}' installed.")
        return 0

    options: dict = {"recursive": args.recursive or None, "exclude": args.exclude or None}
    if args.model:
        options["model"] = args.model
    if args.shortlist:
        options["shortlist_size"] = args.shortlist
    if args.kinds:
        options["kinds"] = args.kinds.split(",")
    if args.criteria:
        options["criteria"] = args.criteria.split(",")
    try:
        settings = build_settings(settings, {k: v for k, v in options.items() if v is not None})
    except ValueError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    if args.no_singles:
        settings = replace(settings, vision_singles=False)

    vision = None
    if not args.no_vision and settings.uses_model():
        vision = OllamaVision(settings)
        try:
            vision.check()
        except VisionError as error:
            print(f"Error: {error}", file=sys.stderr)
            print("Use --no-vision to run with metrics only.", file=sys.stderr)
            return 1

    try:
        report = run(args.folder, settings, vision, lang=args.lang, progress=_progress)
    except FileNotFoundError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    files = write_outputs(report, args.out)
    stats = report["stats"]
    print(
        f"\n{stats['photos']} photos in {stats['groups']} groups: "
        f"{stats['keep']} keep, {stats['reject']} reject, {stats['review']} review "
        f"({stats['total_seconds']}s, {stats['model_calls']} model calls)"
    )
    for group in report["groups"]:
        if len(group["photos"]) < 2 and not group["needs_review"]:
            continue
        print(f"\nGroup {group['id']}" + ("  [needs review]" if group["needs_review"] else ""))
        for photo in group["photos"]:
            print(f"  {photo['status'].upper():7} {photo['name']}  {photo['reason']}")
    for item in report["skipped"]:
        print(f"Skipped {item['name']}: {item['error']}")
    print(f"\nFiles written to {Path(args.out).resolve()}")
    return 0