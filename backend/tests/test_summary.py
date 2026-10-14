from keeper.summary import build_facts, summarize, validate
from keeper.vision import VisionError


def make_report():
    return {
        "model": "gemma4:e4b-it-qat",
        "lang": "en",
        "stats": {"photos": 3, "groups": 1, "keep": 1, "review": 1, "reject": 1, "total_seconds": 12.5},
        "skipped": [],
        "options": {"criteria": ["sharpness"], "selected_only": False, "compared_selection": False},
        "groups": [
            {
                "id": 1,
                "needs_review": True,
                "photos": [
                    {"name": "a.jpg", "status": "keep", "reason": "Best", "manual": False},
                    {"name": "b.jpg", "status": "review", "reason": "Close call", "manual": False},
                    {"name": "sub/c.jpg", "status": "reject", "reason": "Soft", "manual": True, "auto_status": "keep"},
                ],
            }
        ],
    }


class Fake:
    def __init__(self, *answers):
        self.answers = list(answers)
        self.calls = 0

    def ask(self, prompt, schema):
        self.calls += 1
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


GOOD = {
    "summary": "1 of 3 photos are keepers and b.jpg is a close call.",
    "double_check": ["b.jpg is very close to the kept photo.", "invented.jpg looks wrong"],
    "tip": "Start with the Review filter.",
}


def test_facts_capture_attention_and_user_changes():
    facts = build_facts(make_report())
    assert [i["name"] for i in facts["needs_attention"]] == ["a.jpg", "b.jpg"]
    assert facts["changed_by_user"] == [{"name": "sub/c.jpg", "from": "keep", "to": "reject"}]


def test_good_answer_is_kept_and_unknown_files_are_dropped():
    result = summarize(make_report(), Fake(GOOD), "en")
    assert result["source"] == "model"
    assert result["double_check"] == ["b.jpg is very close to the kept photo."]


def test_invented_file_or_number_falls_back_after_one_retry():
    bad_file = {**GOOD, "summary": "Great work on ghost.jpg."}
    bad_number = {**GOOD, "summary": "87 photos are keepers."}
    for bad in (bad_file, bad_number):
        fake = Fake(bad, bad)
        result = summarize(make_report(), fake, "en")
        assert result["source"] == "template" and fake.calls == 2


def test_retry_can_recover_and_model_errors_fall_back():
    bad = {**GOOD, "summary": "87 photos."}
    assert summarize(make_report(), Fake(bad, GOOD), "en")["source"] == "model"
    assert summarize(make_report(), Fake(VisionError("down")), "en")["source"] == "template"
    assert summarize(make_report(), None, "es")["summary"].startswith("1 de 3")


def test_validate_rejects_malformed_and_overlong():
    facts = build_facts(make_report())
    assert validate({"summary": "x"}, facts) is None
    assert validate({**GOOD, "summary": "a" * 800}, facts) is None
    

def test_suggestions_come_from_the_data_and_feed_the_fallback():
    report = make_report()
    report["groups"].append(
        {"id": 2, "needs_review": True, "photos": [
            {"name": "d.jpg", "status": "review", "reason": "Only shot, defects", "manual": False, "flags": ["overexposed"]}
        ]}
    )
    facts = build_facts(report)
    assert facts["suggestion_ids"] == ["single_defects", "close_calls"]
    assert "Compare as one group" in facts["suggestions"][1]
    assert "segundo cuadro" in summarize(report, None, "es")["tip"]


def test_prompt_hides_internal_ids():
    from keeper.summary import build_prompt
    assert "suggestion_ids" not in build_prompt(build_facts(make_report()), "en")