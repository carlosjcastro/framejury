import time

import pytest
from PIL import ImageFilter

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from tests.test_keeper import make_scene, save  # noqa: E402


@pytest.fixture()
def client(tmp_path, monkeypatch):
    from keeper import api

    monkeypatch.setattr(api, "DATA_DIR", tmp_path / "data")
    (tmp_path / "data").mkdir()
    api.JOBS.clear()
    return TestClient(api.app)


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