from __future__ import annotations

from dataclasses import dataclass, field

from .config import Settings
from .metrics import PhotoInfo
from .vision import Observation

HARD_FLAGS = {"soft", "out_of_focus", "closed_eyes", "overexposed", "underexposed"}
HARD_PENALTY = 50.0
SOFT_PENALTY = 15.0
MODEL_VOTE_BONUS = 5.0
SHARPNESS_WEIGHT = 60.0
FOCUS_WEIGHT = 15.0
EXPRESSION_WEIGHT = 15.0
CLOSE_CALL_MARGIN = 5.0

TEXT = {
    "en": {
        "flags": {
            "soft": "Softer than a sharper near-duplicate",
            "out_of_focus": "Subject out of focus",
            "closed_eyes": "Closed eyes",
            "overexposed": "Highlights blown out",
            "underexposed": "Too dark",
            "awkward_expression": "Awkward expression",
        },
        "keeper": "Best of its group on sharpness, focus and expression",
        "lower": "Lower overall score than {keeper}",
        "lost_sharpness": "Less sharp than {keeper} ({ratio:.0%} of its sharpness)",
        "close_call": "Very close to the kept photo, worth a quick look",
        "not_shortlisted": "Sharpness {ratio:.0%} of the sharpest shot in its group",
        "single_ok": "Only shot of its moment, no defects found",
        "single_review": "Only shot of its moment, but with defects. Check it manually",
        "vision_failed": "The model could not judge this group. Decided on sharpness only",
    },
    "es": {
        "flags": {
            "soft": "Más blanda que una toma casi igual más nítida",
            "out_of_focus": "Sujeto desenfocado",
            "closed_eyes": "Ojos cerrados",
            "overexposed": "Altas luces quemadas",
            "underexposed": "Demasiado oscura",
            "awkward_expression": "Expresión poco natural",
        },
        "keeper": "La mejor de su grupo en nitidez, enfoque y expresión",
        "lower": "Puntaje general más bajo que {keeper}",
        "lost_sharpness": "Menos nítida que {keeper} ({ratio:.0%} de su nitidez)",
        "close_call": "Muy cercana a la foto conservada, vale un vistazo",
        "not_shortlisted": "Nitidez del {ratio:.0%} respecto de la toma más nítida de su grupo",
        "single_ok": "Única toma de su momento, sin defectos detectados",
        "single_review": "Única toma de su momento, pero con defectos. Revisala a mano",
        "vision_failed": "El modelo no pudo juzgar este grupo. Se decidió solo por nitidez",
    },
}


@dataclass
class PhotoDecision:
    name: str
    path: str
    status: str
    reason: str
    flags: list[str]
    score: float
    observation: Observation | None
    sharpness: float
    taken_at: float


@dataclass
class GroupDecision:
    photos: list[PhotoDecision]
    keeper: str
    needs_review: bool
    vision_error: str | None = None


def _flags(
    info: PhotoInfo,
    observation: Observation | None,
    relative_sharpness: float,
    in_group: bool,
    settings: Settings,
) -> list[str]:
    flags: list[str] = []
    if in_group and relative_sharpness < settings.soft_ratio:
        flags.append("soft")
    if observation:
        if observation.closed_eyes > 0:
            flags.append("closed_eyes")
        if observation.subject_focus <= 2:
            flags.append("out_of_focus")
        if observation.expression <= 2:
            flags.append("awkward_expression")
    if info.clipped_high > settings.clipped_high_limit:
        flags.append("overexposed")
    if info.clipped_low > settings.clipped_low_limit:
        flags.append("underexposed")
    return flags


def _score(
    relative_sharpness: float,
    observation: Observation | None,
    flags: list[str],
    voted: bool,
) -> float:
    score = relative_sharpness * SHARPNESS_WEIGHT
    if observation:
        score += observation.subject_focus / 5.0 * FOCUS_WEIGHT
        score += observation.expression / 5.0 * EXPRESSION_WEIGHT
    else:
        score += FOCUS_WEIGHT * 0.8 + EXPRESSION_WEIGHT * 0.8
    if voted:
        score += MODEL_VOTE_BONUS
    for flag in flags:
        score -= HARD_PENALTY if flag in HARD_FLAGS else SOFT_PENALTY
    return score


def _labels(flags: list[str], lang: str) -> str:
    return "; ".join(TEXT[lang]["flags"][flag] for flag in flags)


def decide(
    infos: list[PhotoInfo],
    shortlist: list[str],
    observations: dict[str, Observation],
    model_best: str | None,
    model_reason: str | None,
    settings: Settings,
    lang: str,
    vision_error: str | None = None,
) -> GroupDecision:
    text = TEXT[lang]
    top = max((info.sharpness for info in infos), default=1.0) or 1.0
    in_group = len(infos) > 1
    candidates = set(shortlist) if shortlist else {info.name for info in infos}

    scored: list[PhotoDecision] = []
    for info in infos:
        relative = info.sharpness / top
        observation = observations.get(info.name)
        if info.name not in candidates:
            scored.append(
                PhotoDecision(
                    info.name, info.path, "reject",
                    text["not_shortlisted"].format(ratio=relative),
                    ["soft"], -1000.0, None, info.sharpness, info.taken_at,
                )
            )
            continue
        flags = _flags(info, observation, relative, in_group, settings)
        score = _score(relative, observation, flags, info.name == model_best)
        scored.append(
            PhotoDecision(
                info.name, info.path, "keep", "", flags, score,
                observation, info.sharpness, info.taken_at,
            )
        )

    contenders = sorted((p for p in scored if p.name in candidates), key=lambda p: p.score, reverse=True)
    keeper = contenders[0]
    margin = keeper.score - contenders[1].score if len(contenders) > 1 else 100.0
    keeper_hard = [flag for flag in keeper.flags if flag in HARD_FLAGS]

    if not in_group:
        if keeper_hard:
            keeper.status = "review"
            keeper.reason = f"{text['single_review']}. {_labels(keeper_hard, lang)}"
        else:
            keeper.status = "keep"
            keeper.reason = text["single_ok"]
        return GroupDecision(scored, keeper.name, bool(keeper_hard), vision_error)

    keeper.status = "review" if keeper_hard else "keep"
    if model_best == keeper.name and model_reason:
        keeper.reason = model_reason
    elif keeper_hard:
        keeper.reason = f"{text['keeper']}. {_labels(keeper_hard, lang)}"
    else:
        keeper.reason = text["keeper"]
    if vision_error:
        keeper.reason = f"{keeper.reason}. {text['vision_failed']}"

    for photo in contenders[1:]:
        relative = photo.sharpness / top
        if photo.flags:
            photo.reason = _labels(photo.flags, lang)
        elif relative < 0.95:
            photo.reason = text["lost_sharpness"].format(keeper=keeper.name, ratio=relative)
        else:
            photo.reason = text["lower"].format(keeper=keeper.name)
        photo.status = "reject"

    needs_review = bool(keeper_hard) or margin < CLOSE_CALL_MARGIN
    if margin < CLOSE_CALL_MARGIN and contenders[1].status == "reject":
        contenders[1].reason = f"{text['close_call']}. {contenders[1].reason}"
    return GroupDecision(scored, keeper.name, needs_review, vision_error)
