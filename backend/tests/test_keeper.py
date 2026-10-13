import json

import httpx
import numpy as np
import pytest
from PIL import Image, ImageFilter

from keeper.config import Settings
from keeper.grouping import group_photos
from keeper.metrics import analyze_file, sharpness
from keeper.pipeline import run, scan_folder, write_outputs
from keeper.vision import Observation, OllamaVision, Verdict, VisionError, parse_response


def make_scene(seed=0, size=(640, 480)):
    rng = np.random.default_rng(seed)
    base = rng.integers(0, 255, (size[1] // 16, size[0] // 16, 3), dtype=np.uint8)
    return Image.fromarray(base).resize(size, Image.Resampling.NEAREST)


def save(image, folder, name, mtime=None):
    path = folder / name
    image.save(path, "JPEG", quality=92)
    if mtime is not None:
        import os
        os.utime(path, (mtime, mtime))
    return path


def test_sharp_beats_blurred():
    scene = make_scene()
    assert sharpness(scene) > sharpness(scene.filter(ImageFilter.GaussianBlur(4))) * 3


def test_grouping_by_time_and_similarity():
    scene = make_scene(1)
    other = make_scene(99)
    import tempfile, pathlib
    with tempfile.TemporaryDirectory() as d:
        d = pathlib.Path(d)
        a = analyze_file(save(scene, d, "a.jpg", 1000))
        b = analyze_file(save(scene.filter(ImageFilter.GaussianBlur(2)), d, "b.jpg", 1003))
        c = analyze_file(save(other, d, "c.jpg", 1005))
        e = analyze_file(save(scene, d, "e.jpg", 5000))
    groups = group_photos([a, b, c, e], 12.0, 18)
    names = [[p.name for p in g] for g in groups]
    assert ["a.jpg", "b.jpg"] in names
    assert ["e.jpg"] in names


class FakeVision:
    def __init__(self, best_index=0, fail=False):
        self.calls = []
        self.best_index = best_index
        self.fail = fail

    def judge(self, paths, lang):
        self.calls.append(paths)
        if self.fail:
            raise VisionError("boom")
        obs = [Observation(1, 0, 4, 4, "ok") for _ in paths]
        return Verdict(obs, self.best_index, "best one", 0.1)


def build_folder(tmp_path):
    scene = make_scene(3)
    save(scene, tmp_path, "sharp.jpg", 1000)
    save(scene.filter(ImageFilter.GaussianBlur(5)), tmp_path, "blur.jpg", 1002)
    save(make_scene(77), tmp_path, "single.jpg", 9000)
    (tmp_path / "broken.jpg").write_bytes(b"not an image")
    (tmp_path / "notes.txt").write_text("x")
    return tmp_path


def test_scan_ignores_non_images(tmp_path):
    build_folder(tmp_path)
    names = [p.name for p in scan_folder(tmp_path)]
    assert "notes.txt" not in names and "sharp.jpg" in names


def test_pipeline_with_fake_vision(tmp_path):
    folder = build_folder(tmp_path / "in")  if (tmp_path / "in").mkdir() is None else None
    vision = FakeVision()
    report = run(folder, Settings(), vision)
    assert report["stats"]["photos"] == 3
    assert [s["name"] for s in report["skipped"]] == ["broken.jpg"]
    status = {p["name"]: p["status"] for g in report["groups"] for p in g["photos"]}
    assert status["sharp.jpg"] == "keep"
    assert status["blur.jpg"] == "reject"
    assert status["single.jpg"] == "keep"
    assert len(vision.calls) == 2


def test_pipeline_vision_failure_falls_back(tmp_path):
    folder = tmp_path / "in"
    folder.mkdir()
    build_folder(folder)
    report = run(folder, Settings(), FakeVision(fail=True))
    status = {p["name"]: p["status"] for g in report["groups"] for p in g["photos"]}
    assert status["sharp.jpg"] == "keep" and status["blur.jpg"] == "reject"
    assert any(g["vision_error"] for g in report["groups"])


def test_no_vision_and_outputs(tmp_path):
    folder = tmp_path / "in"
    folder.mkdir()
    build_folder(folder)
    report = run(folder, Settings(), None)
    files = write_outputs(report, tmp_path / "out")
    assert "sharp.jpg" in files["keepers"].read_text()
    assert "blur.jpg" in files["rejects"].read_text()
    assert json.loads(files["report"].read_text())["stats"]["photos"] == 3


def test_closed_eyes_blocks_keeper_without_review_loss(tmp_path):
    folder = tmp_path / "in"
    folder.mkdir()
    scene = make_scene(5)
    save(scene, folder, "a.jpg", 1000)
    save(scene.filter(ImageFilter.GaussianBlur(0.2)), folder, "b.jpg", 1002)

    class Eyes:
        def judge(self, paths, lang):
            obs = [Observation(1, 1, 4, 4, "eyes closed"), Observation(1, 0, 4, 4, "fine")]
            return Verdict(obs, 0, "a", 0.1)

    report = run(folder, Settings(), Eyes())
    status = {p["name"]: p["status"] for g in report["groups"] for p in g["photos"]}
    assert status["b.jpg"] == "keep" and status["a.jpg"] == "reject"


def test_parse_response_validation():
    good = json.dumps({"photos": [{"index": 1, "people": 2, "closed_eyes": 0, "expression": 9, "subject_focus": 3, "note": "x"}],
                       "best": 1, "best_reason": "r"})
    obs, best, _ = parse_response(good, 1)
    assert obs[0].expression == 5 and best == 0
    with pytest.raises(VisionError):
        parse_response("nope", 1)
    with pytest.raises(VisionError):
        parse_response(good, 2)


def test_ollama_payload_and_check(tmp_path):
    img = save(make_scene(), tmp_path, "x.jpg")
    seen = {}

    def handler(request: httpx.Request):
        if request.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": "gemma4:e4b-it-qat"}]})
        seen.update(json.loads(request.content))
        content = json.dumps({"photos": [{"index": 1, "people": 1, "closed_eyes": 0, "expression": 4,
                                          "subject_focus": 4, "note": "n"}], "best": 1, "best_reason": "r"})
        return httpx.Response(200, json={"message": {"content": content}})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    vision = OllamaVision(Settings(), client=client)
    vision.check()
    verdict = vision.judge([str(img)], "en")
    assert verdict.best_index == 0
    assert seen["think"] is False and seen["stream"] is False
    assert seen["format"]["type"] == "object"
    assert len(seen["messages"][0]["images"]) == 1


def test_check_missing_model():
    client = httpx.Client(transport=httpx.MockTransport(
        lambda r: httpx.Response(200, json={"models": [{"name": "other"}]})))
    with pytest.raises(VisionError):
        OllamaVision(Settings(), client=client).check()
