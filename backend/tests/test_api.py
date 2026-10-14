import time

import pytest
from PIL import ImageFilter

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from tests.test_framejury import make_scene, save  # noqa: E402


@pytest.fixture()
def client(tmp_path, monkeypatch):
    from framejury import api

    monkeypatch.setattr(api, "DATA_DIR", tmp_path / "data")
    (tmp_path / "data").mkdir()
    api.JOBS.clear()
    return TestClient(api.app, base_url="http://localhost")


def wait(client, job_id):
    for _ in range(100):
        job = client.get(f"/jobs/{job_id}").json()
        if job["status"] != "running":
            return job
        time.sleep(0.05)
    raise AssertionError("job did not finish")


def test_scan_select_compare_and_override(client, tmp_path):
    photos = tmp_path / "photos"
    (photos / "sub").mkdir(parents=True)
    scene = make_scene(21)
    save(scene, photos, "a.jpg", 1000)
    save(scene.filter(ImageFilter.GaussianBlur(3)), photos, "b.jpg", 1002)
    save(scene, photos / "sub", "c.jpg", 1004)

    flat = client.post("/scan", json={"folder": str(photos)}).json()
    deep = client.post("/scan", json={"folder": str(photos), "options": {"recursive": True}}).json()
    assert flat["total"] == 2 and deep["total"] == 3

    created = client.post("/jobs", json={
        "folder": str(photos), "vision": False,
        "options": {"recursive": True, "criteria": ["sharpness"]},
        "files": ["a.jpg", "sub/c.jpg"], "compare_selected": True,
    })
    job = wait(client, created.json()["id"])
    assert job["status"] == "done" and job["report"]["stats"]["photos"] == 2
    assert client.get(f"/jobs/{job['id']}/thumb/sub/c.jpg").status_code == 200

    changed = client.post(f"/jobs/{job['id']}/photos/bulk", json={"names": ["a.jpg", "sub/c.jpg"], "status": "reject"})
    assert changed.json()["stats"]["reject"] == 2
    assert client.patch(f"/jobs/{job['id']}/photos/sub/c.jpg", json={"status": "keep"}).json()["status"] == "keep"
    assert client.delete(f"/jobs/{job['id']}").status_code == 204


def test_validation_and_traversal(client, tmp_path):
    scene = make_scene(22)
    save(scene, tmp_path, "a.jpg")
    assert client.post("/jobs", json={"folder": str(tmp_path), "vision": False, "files": []}).status_code == 400
    assert client.post("/jobs", json={"folder": str(tmp_path), "vision": False, "files": ["a.jpg"], "compare_selected": True}).status_code == 400
    assert client.post("/jobs", json={"folder": str(tmp_path), "options": {"criteria": []}}).status_code == 400
    assert client.get("/scan/thumb", params={"folder": str(tmp_path), "name": "../etc/passwd"}).status_code == 404
    assert "bounds" in client.get("/config").json()
    

def test_summary_without_model_uses_template_and_is_saved(client, tmp_path):
    scene = make_scene(23)
    save(scene, tmp_path, "a.jpg", 1000)
    save(scene.filter(ImageFilter.GaussianBlur(3)), tmp_path, "b.jpg", 1002)
    job = wait(client, client.post("/jobs", json={"folder": str(tmp_path), "vision": False}).json()["id"])
    result = client.post(f"/jobs/{job['id']}/summary")
    assert result.status_code == 200 and result.json()["source"] == "template"
    assert client.get(f"/jobs/{job['id']}").json()["summary"]["source"] == "template"


def test_problems_carry_a_code_the_interface_can_explain(client, tmp_path, monkeypatch):
    from framejury import api
    from framejury.vision import VisionError

    missing = client.post("/jobs", json={"folder": str(tmp_path / "nope")})
    assert missing.status_code == 400
    assert missing.json()["detail"]["code"] == "folder_missing"

    empty = tmp_path / "empty"
    empty.mkdir()
    none = client.post("/jobs", json={"folder": str(empty), "vision": False})
    assert none.status_code == 400
    assert none.json()["detail"]["code"] == "no_photos"

    save(make_scene(30), tmp_path, "a.jpg")

    class Down:
        def __init__(self, settings):
            pass

        def check(self):
            raise VisionError("Cannot reach Ollama", code="ollama_down")

        def models(self):
            raise VisionError("Cannot reach Ollama", code="ollama_down")

    monkeypatch.setattr(api, "OllamaVision", Down)
    job = client.post("/jobs", json={"folder": str(tmp_path)})
    assert job.status_code == 503
    assert job.json()["detail"]["code"] == "ollama_down"
    assert client.get("/models").json()["detail"]["code"] == "ollama_down"

    class NoModel(Down):
        def check(self):
            raise VisionError("Model 'x' is not installed", code="model_missing", model="x")

    monkeypatch.setattr(api, "OllamaVision", NoModel)
    detail = client.post("/jobs", json={"folder": str(tmp_path)}).json()["detail"]
    assert detail["code"] == "model_missing" and detail["model"] == "x"


def test_requests_with_a_foreign_host_are_refused(client):
    assert client.get("/health").status_code == 200
    assert client.get("/health", headers={"host": "evil.example"}).status_code == 400


def test_changes_from_a_foreign_origin_are_refused(client, tmp_path):
    body = {"folder": str(tmp_path), "vision": False}
    foreign = client.post("/jobs", json=body, headers={"origin": "https://evil.example"})
    assert foreign.status_code == 403
    assert client.get("/health", headers={"origin": "https://evil.example"}).status_code == 200
    own = client.post("/jobs", json=body, headers={"origin": "http://localhost:3000"})
    assert own.status_code != 403