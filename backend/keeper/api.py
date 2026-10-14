import io
import json
import threading
import time
import uuid
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import __version__
from .config import BOUNDS, CRITERIA, KIND_LABELS, Settings, build_settings
from .export import export_folders, to_csv, write_xmp
from .metrics import load_rgb
from .pipeline import kind_of, run, scan_folder
from .summary import summarize
from .vision import OllamaVision, VisionError

app = FastAPI(title="Framejury API", version=__version__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)
JOBS: dict[str, dict] = {}
SCAN_LIMIT = 5000
RUN_LOCK = threading.Lock()


class Options(BaseModel):
    model: str | None = None
    criteria: list[str] | None = None
    kinds: list[str] | None = None
    recursive: bool | None = None
    exclude: list[str] | None = None
    group_gap_seconds: float | None = None
    group_hash_distance: int | None = None
    shortlist_size: int | None = None
    soft_ratio: float | None = None

    def as_dict(self) -> dict:
        return self.model_dump(exclude_none=True)


class ScanRequest(BaseModel):
    folder: str
    options: Options = Field(default_factory=Options)


class JobRequest(BaseModel):
    folder: str
    lang: Literal["en", "es"] = "en"
    vision: bool = True
    options: Options = Field(default_factory=Options)
    files: list[str] | None = None
    compare_selected: bool = False


class Override(BaseModel):
    status: Literal["keep", "reject", "review"]


class BulkOverride(BaseModel):
    names: list[str]
    status: Literal["keep", "reject", "review"]


class FolderExport(BaseModel):
    destination: str | None = None
    include_rejects: bool = False


def _save(job: dict) -> None:
    path = DATA_DIR / f"{job['id']}.json"
    path.write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")


def _load_all() -> None:
    for file in DATA_DIR.glob("*.json"):
        try:
            job = json.loads(file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if job.get("status") == "running":
            job["status"] = "error"
            job["error"] = "Interrupted by a server restart"
        JOBS[job["id"]] = job


def _recount(report: dict) -> None:
    counts = {"keep": 0, "reject": 0, "review": 0}
    for group in report["groups"]:
        for photo in group["photos"]:
            counts[photo["status"]] += 1
    report["stats"].update(counts)


def _find_photo(job: dict, name: str) -> str | None:
    for group in job.get("report", {}).get("groups", []):
        for photo in group["photos"]:
            if photo["name"] == name:
                return photo["path"]
    return None


def _job(job_id: str) -> dict:
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


def _report(job_id: str) -> dict:
    report = _job(job_id).get("report")
    if not report:
        raise HTTPException(409, "Job has no report yet")
    return report


def _settings(options: Options) -> Settings:
    try:
        return build_settings(Settings(), options.as_dict())
    except ValueError as error:
        raise HTTPException(400, str(error))


def _jpeg(path, size: int) -> Response:
    image = load_rgb(path)
    image.thumbnail((max(64, min(size, 1600)),) * 2)
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=82)
    return Response(
        buffer.getvalue(),
        media_type="image/jpeg",
        headers={"Cache-Control": "max-age=3600"},
    )


def _run_job(job_id: str, request: JobRequest, settings: Settings) -> None:
    job = JOBS[job_id]

    def progress(stage: str, done: int, total: int) -> None:
        job["stage"] = stage
        job["done"] = done
        job["total"] = total

    def note(text: str) -> None:
        job["current"] = text

    with RUN_LOCK:
        try:
            vision = OllamaVision(settings) if request.vision and settings.uses_model() else None
            job["vision"] = vision is not None
            job["report"] = run(
                request.folder,
                settings,
                vision,
                lang=request.lang,
                progress=progress,
                note=note,
                only=request.files,
                single_group=request.compare_selected,
            )
            job["status"] = "done"
        except Exception as error:
            job["status"] = "error"
            job["error"] = str(error)
    _save(job)


_load_all()


@app.get("/health")
def health():
    return {"status": "ok", "version": __version__, "model": Settings().model}


@app.get("/config")
def config():
    base = Settings()
    return {
        "defaults": {
            "model": base.model,
            "criteria": sorted(base.criteria),
            "kinds": sorted(base.kinds),
            "recursive": base.recursive,
            "exclude": list(base.exclude),
            "group_gap_seconds": base.group_gap_seconds,
            "group_hash_distance": base.group_hash_distance,
            "shortlist_size": base.shortlist_size,
            "soft_ratio": base.soft_ratio,
        },
        "bounds": BOUNDS,
        "criteria": [{"id": key, **value} for key, value in CRITERIA.items()],
        "kinds": [{"id": key, "label": label} for key, label in KIND_LABELS.items()],
    }


@app.get("/models")
def models():
    try:
        return {"models": OllamaVision(Settings()).models()}
    except VisionError as error:
        raise HTTPException(503, str(error))


@app.post("/scan")
def scan(request: ScanRequest):
    folder = Path(request.folder)
    if not folder.is_dir():
        raise HTTPException(400, f"Folder not found: {request.folder}")
    settings = _settings(request.options)
    items = scan_folder(folder, settings)
    files = []
    for path, name in items[:SCAN_LIMIT]:
        files.append(
            {
                "name": name,
                "folder": name.rsplit("/", 1)[0] if "/" in name else "",
                "kind": kind_of(path),
                "size": path.stat().st_size,
            }
        )
    return {
        "folder": str(folder.resolve()),
        "total": len(items),
        "truncated": len(items) > SCAN_LIMIT,
        "files": files,
    }


@app.get("/scan/thumb")
def scan_thumb(folder: str, name: str, size: int = 240):
    root = Path(folder).resolve()
    target = (root / name).resolve()
    if root not in target.parents or not target.is_file():
        raise HTTPException(404, "Photo not found")
    try:
        return _jpeg(target, size)
    except Exception as error:
        raise HTTPException(422, f"Cannot read this photo: {error}")


@app.post("/jobs", status_code=202)
def create_job(request: JobRequest):
    if not Path(request.folder).is_dir():
        raise HTTPException(400, f"Folder not found: {request.folder}")
    settings = _settings(request.options)
    if request.files is not None and not request.files:
        raise HTTPException(400, "Select at least one photo")
    if request.compare_selected and request.files is not None and len(request.files) < 2:
        raise HTTPException(400, "Pick at least two photos to compare")
    if request.vision and settings.uses_model():
        try:
            OllamaVision(settings).check()
        except VisionError as error:
            raise HTTPException(503, str(error))
    job_id = uuid.uuid4().hex[:8]
    JOBS[job_id] = {
        "id": job_id,
        "status": "running",
        "stage": "analyze",
        "done": 0,
        "total": 0,
        "vision": request.vision and settings.uses_model(),
        "folder": request.folder,
        "created_at": time.time(),
        "selected": len(request.files) if request.files is not None else None,
    }
    threading.Thread(target=_run_job, args=(job_id, request, settings), daemon=True).start()
    return {"id": job_id}


@app.get("/jobs")
def list_jobs():
    rows = []
    for job in sorted(JOBS.values(), key=lambda j: j.get("created_at", 0), reverse=True):
        stats = (job.get("report") or {}).get("stats")
        rows.append(
            {
                "id": job["id"],
                "status": job["status"],
                "folder": job.get("folder") or (job.get("report") or {}).get("folder"),
                "created_at": job.get("created_at"),
                "stats": stats,
            }
        )
    return {"jobs": rows[:50]}


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    return _job(job_id)


@app.delete("/jobs/{job_id}", status_code=204)
def delete_job(job_id: str):
    job = _job(job_id)
    if job["status"] == "running":
        raise HTTPException(409, "Wait for the analysis to finish")
    JOBS.pop(job_id, None)
    (DATA_DIR / f"{job_id}.json").unlink(missing_ok=True)
    return Response(status_code=204)


@app.get("/jobs/{job_id}/thumb/{name:path}")
def thumbnail(job_id: str, name: str, size: int = 480):
    path = _find_photo(_job(job_id), name)
    if not path:
        raise HTTPException(404, "Photo not in this job")
    return _jpeg(path, size)


def _apply(report: dict, names: set[str], status: str) -> list[dict]:
    changed = []
    for group in report["groups"]:
        for photo in group["photos"]:
            if photo["name"] in names:
                photo.setdefault("auto_status", photo["status"])
                photo["status"] = status
                photo["manual"] = status != photo["auto_status"]
                changed.append(photo)
    return changed


@app.patch("/jobs/{job_id}/photos/{name:path}")
def override_photo(job_id: str, name: str, body: Override):
    job = _job(job_id)
    report = job.get("report")
    if not report:
        raise HTTPException(409, "Job has no report yet")
    changed = _apply(report, {name}, body.status)
    if not changed:
        raise HTTPException(404, "Photo not in this job")
    _recount(report)
    _save(job)
    return changed[0]


@app.post("/jobs/{job_id}/photos/bulk")
def override_many(job_id: str, body: BulkOverride):
    job = _job(job_id)
    report = job.get("report")
    if not report:
        raise HTTPException(409, "Job has no report yet")
    changed = _apply(report, set(body.names), body.status)
    _recount(report)
    _save(job)
    return {"changed": len(changed), "stats": report["stats"]}


@app.post("/jobs/{job_id}/summary")
def create_summary(job_id: str):
    job = _job(job_id)
    report = _report(job_id)
    vision = None
    if report.get("model"):
        vision = OllamaVision(build_settings(Settings(), {"model": report["model"]}))
    with RUN_LOCK:
        result = summarize(report, vision, report.get("lang", "en"))
    result["generated_at"] = time.time()
    job["summary"] = result
    _save(job)
    return result


@app.get("/jobs/{job_id}/export.csv")
def export_csv(job_id: str):
    return Response(
        to_csv(_report(job_id)).encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="framejury-{job_id}.csv"'},
    )


@app.post("/jobs/{job_id}/export/folders")
def export_to_folders(job_id: str, body: FolderExport):
    try:
        return export_folders(_report(job_id), body.destination or None, body.include_rejects)
    except (ValueError, OSError) as error:
        raise HTTPException(400, str(error))


@app.post("/jobs/{job_id}/export/xmp")
def export_xmp(job_id: str):
    try:
        return write_xmp(_report(job_id))
    except OSError as error:
        raise HTTPException(400, str(error))