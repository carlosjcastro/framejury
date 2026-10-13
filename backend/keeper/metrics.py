from __future__ import annotations

import io
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps

from .config import RAW_EXTENSIONS

EXIF_IFD = 0x8769
EXIF_DATETIME_ORIGINAL = 36867
ANALYSIS_SIDE = 1024
TILE_GRID = 6
SHARPNESS_PERCENTILE = 90
HASH_SIZE = 8


@dataclass
class PhotoInfo:
    path: str
    name: str
    taken_at: float
    width: int
    height: int
    sharpness: float
    brightness: float
    clipped_high: float
    clipped_low: float
    dhash: int
    has_exif_time: bool = True


EXIF_ORIENTATION = 274
FLIP_TRANSPOSE = {3: Image.Transpose.ROTATE_180, 5: Image.Transpose.ROTATE_90, 6: Image.Transpose.ROTATE_270}


def _load_raw_preview(path: Path) -> Image.Image:
    try:
        import rawpy
    except ImportError as error:
        raise RuntimeError("RAW files need the rawpy package: pip install rawpy") from error
    try:
        with rawpy.imread(str(path)) as raw:
            thumb = raw.extract_thumb()
            flip = raw.sizes.flip
    except (rawpy.LibRawError, rawpy.LibRawNoThumbnailError, rawpy.LibRawUnsupportedThumbnailError) as error:
        raise RuntimeError(f"Cannot read a preview from this RAW file: {error}") from error
    if thumb.format == rawpy.ThumbFormat.JPEG:
        image = Image.open(io.BytesIO(thumb.data))
        has_orientation = bool(image.getexif().get(EXIF_ORIENTATION))
        image = ImageOps.exif_transpose(image).convert("RGB")
    else:
        image = Image.fromarray(thumb.data).convert("RGB")
        has_orientation = False
    if not has_orientation and flip in FLIP_TRANSPOSE:
        image = image.transpose(FLIP_TRANSPOSE[flip])
    return image


def load_rgb(path: str | Path) -> Image.Image:
    path = Path(path)
    if path.suffix.lower() in RAW_EXTENSIONS:
        return _load_raw_preview(path)
    with Image.open(path) as image:
        return ImageOps.exif_transpose(image).convert("RGB")


def read_capture_time(path: str | Path) -> tuple[float, bool]:
    try:
        with Image.open(path) as image:
            raw = image.getexif().get_ifd(EXIF_IFD).get(EXIF_DATETIME_ORIGINAL)
        if raw:
            return datetime.strptime(str(raw).strip(), "%Y:%m:%d %H:%M:%S").timestamp(), True
    except (OSError, ValueError, KeyError):
        pass
    return os.path.getmtime(path), False


def sharpness(image: Image.Image) -> float:
    gray = np.asarray(image.convert("L"))
    height, width = gray.shape
    scale = ANALYSIS_SIDE / max(height, width)
    if scale < 1:
        gray = cv2.resize(
            gray,
            (max(1, int(width * scale)), max(1, int(height * scale))),
            interpolation=cv2.INTER_AREA,
        )
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    height, width = laplacian.shape
    tile_h, tile_w = max(1, height // TILE_GRID), max(1, width // TILE_GRID)
    variances = [
        laplacian[r * tile_h : (r + 1) * tile_h, c * tile_w : (c + 1) * tile_w].var()
        for r in range(TILE_GRID)
        for c in range(TILE_GRID)
    ]
    return float(np.percentile(variances, SHARPNESS_PERCENTILE))


def exposure(image: Image.Image) -> tuple[float, float, float]:
    small = image.convert("L")
    small.thumbnail((256, 256))
    pixels = np.asarray(small)
    return (
        float(pixels.mean()) / 255.0,
        float((pixels >= 250).mean()),
        float((pixels <= 5).mean()),
    )


def dhash(image: Image.Image) -> int:
    small = image.convert("L").resize((HASH_SIZE + 1, HASH_SIZE), Image.Resampling.LANCZOS)
    pixels = np.asarray(small, dtype=np.int16)
    bits = (pixels[:, 1:] > pixels[:, :-1]).flatten()
    value = 0
    for bit in bits:
        value = (value << 1) | int(bit)
    return value


def hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def analyze_file(path: str | Path) -> PhotoInfo:
    path = Path(path)
    image = load_rgb(path)
    brightness, clipped_high, clipped_low = exposure(image)
    taken_at, has_exif_time = read_capture_time(path)
    return PhotoInfo(
        path=str(path),
        name=path.name,
        taken_at=taken_at,
        width=image.width,
        height=image.height,
        sharpness=sharpness(image),
        brightness=brightness,
        clipped_high=clipped_high,
        clipped_low=clipped_low,
        dhash=dhash(image),
        has_exif_time=has_exif_time,
    )
