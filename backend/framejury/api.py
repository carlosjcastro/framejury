import io
import json
import threading
import time
import uuid
from contextlib import asynccontextmanager
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

ALLOWED_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]
DATA_DIR = Path("data")
SCAN_LIMIT = 5000
JOB_LIST_LIMIT = 50
JOB_ID_LENGTH = 8
THUMB_MIN_SIZE = 64
THUMB_MAX_SIZE = 1600
THUMB_QUALITY = 82
THUMB_CACHE = "max-age=3600"

Decision = Literal["keep", "reject", "review"]

JOBS: dict[str, dict] = {}
RUN_LOCK = threading.Lock()
STORE_LOCK = threading.Lock()


@asynccontextmanager
async def lifespan(_: FastAPI):
    DATA_DIR.mkdir(exist_ok=True)
    _load_all()
    yield


app = FastAPI(title="Framejury API", version=__version__, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    status: Decision


class BulkOverride(BaseModel):
    names: list[str]
    status: Decision


class FolderExport(BaseModel):
    destination: str | None = None
    include_rejects: bool = False


def _problem(status: int, code: str, message: str, **extra) -> HTTPException:
    return HTTPException(status, {"code": code, "message": message, **extra})


def _vision_problem(error: VisionError) -> HTTPException:
    return _problem(503, error.code, str(error), model=error.model)


def _save(job: dict) -> None:
    path = DATA_DIR / f"{job['id']}.json"
    temporary = path.with_suffix(".tmp")
    with STORE_LOCK:
        temporary.write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")
        temporary.replace(path)


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


def _job(job_id: str) -> dict:
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


def _ready_report(job: dict) -> dict:
    report = job.get("report")
    if not report:
        raise HTTPException(409, "Job has no report yet")
    return report


def _report(job_id: str) -> dict:
    return _ready_report(_job(job_id))


def _settings(options: Options) -> Settings:
    try:
        return build_settings(Settings(), options.as_dict())
    except ValueError as error:
        raise HTTPException(400, str(error))


def _require_folder(folder: str) -> Path:
    path = Path(folder)
    if not path.is_dir():
        raise _problem(400, "folder_missing", f"Folder not found: {folder}", folder=folder)
    return path


def _find_photo(job: dict, name: str) -> str | None:
    for group in job.get("report", {}).get("groups", []):
        for photo in group["photos"]:
            if photo["name"] == name:
                return photo["path"]
    return None


def _recount(report: dict) -> None:
    counts = {"keep": 0, "reject": 0, "review": 0}
    for group in report["groups"]:
        for photo in group["photos"]:
            counts[photo["status"]] += 1
    report["stats"].update(counts)


def _apply(report: dict, names: set[str], status: Decision) -> list[dict]:
    changed = []
    for group in report["groups"]:
        for photo in group["photos"]:
            if photo["name"] in names:
                photo.setdefault("auto_status", photo["status"])
                photo["status"] = status
                photo["manual"] = status != photo["auto_status"]
                changed.append(photo)
    return changed


def _override(job_id: str, names: set[str], status: Decision) -> tuple[dict, list[dict]]:
    job = _job(job_id)
    report = _ready_report(job)
    changed = _apply(report, names, status)
    if changed:
        _recount(report)
        _save(job)
    return report, changed


def _jpeg(path: str | Path, size: int) -> Response:
    try:
        image = load_rgb(path)
    except Exception as error:
        raise HTTPException(422, f"Cannot read this photo: {error}")
    side = max(THUMB_MIN_SIZE, min(size, THUMB_MAX_SIZE))
    image.thumbnail((side, side))
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=THUMB_QUALITY)
    return Response(
        buffer.getvalue(),
        media_type="image/jpeg",
        headers={"Cache-Control": THUMB_CACHE},
    )


def _job_row(job: dict) -> dict:
    report = job.get("report") or {}
    return {
        "id": job["id"],
        "status": job["status"],
        "folder": job.get("folder") or report.get("folder"),
        "created_at": job.get("created_at"),
        "stats": report.get("stats"),
    }


def _run_job(job_id: str, request: JobRequest, settings: Settings, use_model: bool) -> None:
    job = JOBS[job_id]

    def progress(stage: str, done: int, total: int) -> None:
        job["stage"] = stage
        job["done"] = done
        job["total"] = total

    def note(text: str) -> None:
        job["current"] = text

    with RUN_LOCK:
        try:
            job["report"] = run(
                request.folder,
                settings,
                OllamaVision(settings) if use_model else None,
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
        raise _vision_problem(error)


@app.post("/scan")
def scan(request: ScanRequest):
    folder = _require_folder(request.folder)
    items = scan_folder(folder, _settings(request.options))
    files = [
        {
            "name": name,
            "folder": name.rsplit("/", 1)[0] if "/" in name else "",
            "kind": kind_of(path),
            "size": path.stat().st_size,
        }
        for path, name in items[:SCAN_LIMIT]
    ]
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
    return _jpeg(target, size)


@app.post("/jobs", status_code=202)
def create_job(request: JobRequest):
    folder = _require_folder(request.folder)
    settings = _settings(request.options)
    if request.files is None:
        if not scan_folder(folder, settings):
            raise _problem(
                400,
                "no_photos",
                f"No photos found in {request.folder} with the current file types and filters.",
                folder=request.folder,
            )
    elif not request.files:
        raise HTTPException(400, "Select at least one photo")
    elif request.compare_selected and len(request.files) < 2:
        raise HTTPException(400, "Pick at least two photos to compare")

    use_model = request.vision and settings.uses_model()
    if use_model:
        try:
            OllamaVision(settings).check()
        except VisionError as error:
            raise _vision_problem(error)

    job_id = uuid.uuid4().hex[:JOB_ID_LENGTH]
    JOBS[job_id] = {
        "id": job_id,
        "status": "running",
        "stage": "analyze",
        "done": 0,
        "total": 0,
        "vision": use_model,
        "folder": request.folder,
        "created_at": time.time(),
        "selected": None if request.files is None else len(request.files),
    }
    threading.Thread(
        target=_run_job, args=(job_id, request, settings, use_model), daemon=True
    ).start()
    return {"id": job_id}


@app.get("/jobs")
def list_jobs():
    ordered = sorted(JOBS.values(), key=lambda job: job.get("created_at", 0), reverse=True)
    return {"jobs": [_job_row(job) for job in ordered[:JOB_LIST_LIMIT]]}


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    return _job(job_id)


@app.delete("/jobs/{job_id}", status_code=204)
def delete_job(job_id: str):
    if _job(job_id)["status"] == "running":
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


@app.patch("/jobs/{job_id}/photos/{name:path}")
def override_photo(job_id: str, name: str, body: Override):
    _, changed = _override(job_id, {name}, body.status)
    if not changed:
        raise HTTPException(404, "Photo not in this job")
    return changed[0]


@app.post("/jobs/{job_id}/photos/bulk")
def override_many(job_id: str, body: BulkOverride):
    report, changed = _override(job_id, set(body.names), body.status)
    return {"changed": len(changed), "stats": report["stats"]}


@app.post("/jobs/{job_id}/summary")
def create_summary(job_id: str):
    job = _job(job_id)
    report = _ready_report(job)
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