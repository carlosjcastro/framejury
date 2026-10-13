from __future__ import annotations

from .metrics import PhotoInfo, hamming


def group_photos(
    photos: list[PhotoInfo],
    gap_seconds: float,
    max_hash_distance: int,
) -> list[list[PhotoInfo]]:
    ordered = sorted(photos, key=lambda p: (p.taken_at, p.name))
    groups: list[list[PhotoInfo]] = []
    for photo in ordered:
        if groups and _belongs(groups[-1], photo, gap_seconds, max_hash_distance):
            groups[-1].append(photo)
        else:
            groups.append([photo])
    return groups


def _belongs(
    group: list[PhotoInfo],
    photo: PhotoInfo,
    gap_seconds: float,
    max_hash_distance: int,
) -> bool:
    last = group[-1]
    if photo.has_exif_time and last.has_exif_time and photo.taken_at - last.taken_at > gap_seconds:
        return False
    return min(hamming(photo.dhash, member.dhash) for member in group) <= max_hash_distance
