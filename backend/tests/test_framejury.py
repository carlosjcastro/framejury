import json

import httpx
import numpy as np
import pytest
from PIL import Image, ImageFilter

from framejury.config import Settings, build_settings
from framejury.grouping import group_photos
from framejury.metrics import analyze_file, sharpness
from framejury.pipeline import run, scan_folder, write_outputs
from framejury.vision import Observation, OllamaVision, Verdict, VisionError, parse_response


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


def test_sharper_photo_beats_model_vote_when_gap_is_real():
    from framejury.decision import _score
    sharp = _score(1.0, Observation(1, 0, 4, 4, ""), [], False)
    voted = _score(0.8125, Observation(1, 0, 4, 5, ""), [], True)
    assert sharp > voted
    assert sharp - voted < 5


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
    names = [rel for _, rel in scan_folder(tmp_path)]
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
    assert len(vision.calls) == 3


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
            obs = [Observation(1, 1 if p.endswith("a.jpg") else 0, 4, 4, "x") for p in paths]
            best = next(i for i, p in enumerate(paths) if p.endswith("a.jpg"))
            return Verdict(obs, best, "a", 0.1)

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
    with pytest.raises(VisionError) as caught:
        OllamaVision(Settings(), client=client).check()
    assert caught.value.code == "model_missing"
    assert caught.value.model == Settings().model


def test_check_ollama_down():
    def refuse(request):
        raise httpx.ConnectError("refused", request=request)

    client = httpx.Client(transport=httpx.MockTransport(refuse))
    with pytest.raises(VisionError) as caught:
        OllamaVision(Settings(), client=client).check()
    assert caught.value.code == "ollama_down"


def test_missing_exif_ignores_time_gate(tmp_path):
    scene = make_scene(8)
    a = analyze_file(save(scene, tmp_path, "a.jpg", 1000))
    b = analyze_file(save(scene.filter(ImageFilter.GaussianBlur(1)), tmp_path, "b.jpg", 9000))
    assert not a.has_exif_time and not b.has_exif_time
    assert len(group_photos([a, b], 12.0, 24)) == 1


def sample_report(tmp_path):
    scene = make_scene(4)
    a = save(scene, tmp_path, "a.jpg", 1000)
    b = save(scene.filter(ImageFilter.GaussianBlur(3)), tmp_path, "b.jpg", 1002)
    (tmp_path / "a.xmp").write_text("existing")
    return run(tmp_path, Settings(), None)


def test_csv_export(tmp_path):
    from framejury.export import to_csv
    import csv as csvmod, io as iomod
    report = sample_report(tmp_path)
    rows = list(csvmod.DictReader(iomod.StringIO(to_csv(report))))
    assert {r["file"] for r in rows} == {"a.jpg", "b.jpg"}
    assert {r["decision"] for r in rows} == {"keep", "reject"}


def test_folder_export_copies_companions_and_never_moves(tmp_path):
    from framejury.export import export_folders
    src = tmp_path / "src"
    src.mkdir()
    report = sample_report(src)
    out = tmp_path / "out"
    result = export_folders(report, out, include_rejects=False)
    assert result["copied"]["keep"] == 1 and result["copied"]["reject"] == 0
    assert (out / "Keep" / "a.jpg").exists() and (out / "Keep" / "a.xmp").exists()
    assert (src / "a.jpg").exists() and (src / "b.jpg").exists()
    again = export_folders(report, out)
    assert (out / "Keep" / "a_2.jpg").exists()
    with pytest.raises(ValueError):
        export_folders(report, src)


def test_xmp_is_valid_and_never_overwrites(tmp_path):
    import xml.etree.ElementTree as ET
    from framejury.export import write_xmp
    report = sample_report(tmp_path)
    result = write_xmp(report)
    assert result["written"] == 1 and result["skipped_existing"] == 1
    assert (tmp_path / "a.xmp").read_text() == "existing"
    root = ET.fromstring((tmp_path / "b.xmp").read_text(encoding="utf-8").split("?>", 1)[1].rsplit("<?xpacket", 1)[0])
    description = root.find(".//{http://www.w3.org/1999/02/22-rdf-syntax-ns#}Description")
    assert description.attrib["{http://ns.adobe.com/xap/1.0/}Label"] == "Red"
    assert description.attrib["{http://ns.adobe.com/xap/1.0/}Rating"] == "-1"


def test_raw_preferred_over_same_stem_jpeg_and_loaded_via_preview(tmp_path, monkeypatch):
    from framejury import metrics
    save(make_scene(6), tmp_path, "img1.jpg", 1000)
    (tmp_path / "img1.nef").write_bytes(b"raw")
    save(make_scene(7), tmp_path, "img2.jpg", 2000)
    assert [rel for _, rel in scan_folder(tmp_path)] == ["img1.nef", "img2.jpg"]
    monkeypatch.setattr(metrics, "_load_raw_preview", lambda path: make_scene(6))
    info = analyze_file(tmp_path / "img1.nef")
    assert info.name == "img1.nef" and info.sharpness > 0


def test_raw_preview_orientation_with_fake_rawpy(tmp_path, monkeypatch):
    import io as iomod, sys, types
    from framejury import metrics

    landscape = Image.new("RGB", (60, 40), "red")
    data = iomod.BytesIO()
    landscape.save(data, "JPEG")

    class Fmt:
        JPEG = 1
        BITMAP = 2

    class Err(Exception):
        pass

    class FakeRaw:
        def __init__(self, flip):
            self.sizes = types.SimpleNamespace(flip=flip)

        def extract_thumb(self):
            return types.SimpleNamespace(format=Fmt.JPEG, data=data.getvalue())

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    fake = types.ModuleType("rawpy")
    fake.ThumbFormat = Fmt
    fake.LibRawError = fake.LibRawNoThumbnailError = fake.LibRawUnsupportedThumbnailError = Err
    for flip, size in ((0, (60, 40)), (6, (40, 60)), (3, (60, 40))):
        fake.imread = lambda path, f=flip: FakeRaw(f)
        monkeypatch.setitem(sys.modules, "rawpy", fake)
        assert metrics._load_raw_preview(tmp_path / "x.nef").size == size

    monkeypatch.setitem(sys.modules, "rawpy", None)
    with pytest.raises(RuntimeError, match="rawpy"):
        metrics._load_raw_preview(tmp_path / "x.nef")


def test_build_settings_clamps_and_validates():
    base = Settings()
    tuned = build_settings(base, {"shortlist_size": 99, "soft_ratio": 0.01, "criteria": ["sharpness"], "kinds": ["jpeg"]})
    assert tuned.shortlist_size == 6 and tuned.soft_ratio == 0.3
    assert tuned.criteria == {"sharpness"} and not tuned.uses_model()
    assert tuned.extensions() == {".jpg", ".jpeg"}
    for bad in ({"criteria": []}, {"criteria": ["nope"]}, {"kinds": ["gif"]}, {"model": " "}, {"group_gap_seconds": "x"}):
        with pytest.raises(ValueError):
            build_settings(base, bad)
    assert build_settings(base, None) == base


def test_scan_recursive_kinds_and_exclude(tmp_path):
    scene = make_scene(11)
    (tmp_path / "day1").mkdir()
    (tmp_path / ".hidden").mkdir()
    save(scene, tmp_path, "top.jpg")
    save(scene, tmp_path / "day1", "a.jpg")
    save(scene, tmp_path / "day1", "IMG_draft.jpg")
    save(scene, tmp_path / ".hidden", "h.jpg")
    scene.save(tmp_path / "shot.png")
    flat = [rel for _, rel in scan_folder(tmp_path, Settings())]
    assert flat == ["shot.png", "top.jpg"]
    deep = build_settings(Settings(), {"recursive": True, "exclude": ["*draft*"], "kinds": ["jpeg"]})
    assert [rel for _, rel in scan_folder(tmp_path, deep)] == ["day1/a.jpg", "top.jpg"]
    only_dir = build_settings(Settings(), {"recursive": True, "exclude": ["day1/*"]})
    assert "day1/a.jpg" not in [rel for _, rel in scan_folder(tmp_path, only_dir)]


def test_run_only_selection_and_single_group(tmp_path):
    scene = make_scene(12)
    save(scene, tmp_path, "a.jpg", 1000)
    save(scene.filter(ImageFilter.GaussianBlur(3)), tmp_path, "b.jpg", 1002)
    save(make_scene(55), tmp_path, "c.jpg", 90000)
    report = run(tmp_path, Settings(), None, only=["a.jpg", "c.jpg"], single_group=True)
    assert report["stats"]["photos"] == 2 and report["stats"]["groups"] == 1
    assert report["options"]["selected_only"] and report["options"]["compared_selection"]
    with pytest.raises(ValueError):
        run(tmp_path, Settings(), None, only=["missing.jpg"])


def test_disabled_criteria_are_not_judged(tmp_path):
    scene = make_scene(13)
    save(scene, tmp_path, "a.jpg", 1000)
    save(scene.filter(ImageFilter.GaussianBlur(0.2)), tmp_path, "b.jpg", 1002)

    class Eyes:
        def judge(self, paths, lang):
            obs = [Observation(1, 1 if p.endswith("a.jpg") else 0, 4, 4, "x") for p in paths]
            return Verdict(obs, 0, "a", 0.1)

    off = build_settings(Settings(), {"criteria": ["sharpness", "focus"]})
    report = run(tmp_path, off, Eyes())
    flags = {p["name"]: p["flags"] for g in report["groups"] for p in g["photos"]}
    assert "closed_eyes" not in flags["a.jpg"]
    no_model = build_settings(Settings(), {"criteria": ["sharpness", "exposure"]})
    assert run(tmp_path, no_model, Eyes())["model"] is None


def test_models_listing_flags_vision(tmp_path):
    def handler(request: httpx.Request):
        if request.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": "llama3"}, {"name": "gemma4:e4b-it-qat"}]})
        name = json.loads(request.content)["model"]
        return httpx.Response(200, json={"capabilities": ["completion", "vision"] if "gemma" in name else ["completion"]})

    vision = OllamaVision(Settings(), client=httpx.Client(transport=httpx.MockTransport(handler)))
    listed = vision.models()
    assert listed[0] == {"name": "gemma4:e4b-it-qat", "vision": True}
    assert listed[1]["vision"] is False