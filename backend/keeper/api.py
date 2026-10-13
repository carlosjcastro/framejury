import io
import json
import threading
import uuid
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import __version__
from .config import Settings
from .export import export_folders, to_csv, write_xmp
from .metrics import load_rgb
from .pipeline import run
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


class JobRequest(BaseModel):
    folder: str
    lang: str = "en"
    vision: bool = True


class Override(BaseModel):
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


def _report(job_id: str) -> dict:
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    report = job.get("report")
    if not report:
        raise HTTPException(409, "Job has no report yet")
    return report


def _run_job(job_id: str, request: JobRequest) -> None:
    job = JOBS[job_id]
    settings = Settings()

    def progress(stage: str, done: int, total: int) -> None:
        job["stage"] = stage
        job["done"] = done
        job["total"] = total

    def note(text: str) -> None:
        job["current"] = text

    try:
        vision = OllamaVision(settings) if request.vision else None
        job["report"] = run(
            request.folder,
            settings,
            vision,
            lang=request.lang,
            progress=progress,
            note=note,
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


@app.post("/jobs", status_code=202)
def create_job(request: JobRequest):
    if not Path(request.folder).is_dir():
        raise HTTPException(400, f"Folder not found: {request.folder}")
    if request.vision:
        try:
            OllamaVision(Settings()).check()
        except VisionError as error:
            raise HTTPException(503, str(error))
    job_id = uuid.uuid4().hex[:8]
    JOBS[job_id] = {
        "id": job_id,
        "status": "running",
        "stage": "analyze",
        "done": 0,
        "total": 0,
        "vision": request.vision,
    }
    threading.Thread(target=_run_job, args=(job_id, request), daemon=True).start()
    return {"id": job_id}


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@app.get("/jobs/{job_id}/thumb/{name}")
def thumbnail(job_id: str, name: str, size: int = 480):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    path = _find_photo(job, name)
    if not path:
        raise HTTPException(404, "Photo not in this job")
    size = max(64, min(size, 1600))
    image = load_rgb(path)
    image.thumbnail((size, size))
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=82)
    return Response(
        buffer.getvalue(),
        media_type="image/jpeg",
        headers={"Cache-Control": "max-age=3600"},
    )


@app.patch("/jobs/{job_id}/photos/{name}")
def override_photo(job_id: str, name: str, body: Override):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    report = job.get("report")
    if not report:
        raise HTTPException(409, "Job has no report yet")
    for group in report["groups"]:
        for photo in group["photos"]:
            if photo["name"] == name:
                photo.setdefault("auto_status", photo["status"])
                photo["status"] = body.status
                photo["manual"] = body.status != photo["auto_status"]
                _recount(report)
                _save(job)
                return photo
    raise HTTPException(404, "Photo not in this job")


@app.get("/jobs/{job_id}/export.csv")
def export_csv(job_id: str):
    return Response(
        to_csv(_report(job_id)).encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="framejury-{job_id}.csv"'
        },
    )


@app.post("/jobs/{job_id}/export/folders")
def export_to_folders(job_id: str, body: FolderExport):
    try:
        return export_folders(
            _report(job_id), body.destination or None, body.include_rejects
        )
    except (ValueError, OSError) as error:
        raise HTTPException(400, str(error))


@app.post("/jobs/{job_id}/export/xmp")
def export_xmp(job_id: str):
    try:
        return write_xmp(_report(job_id))
    except OSError as error:
        raise HTTPException(400, str(error))