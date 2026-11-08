"""OpenCV: blur and brightness checks, 1-fps frame extraction (Gemini fallback), and before/after frame grabs."""
from __future__ import annotations

import cv2
import numpy as np

BLUR_MIN = 20.0  # Laplacian variance below this = blurry (tuned on real phone video: plain walls score ~15-40 even when sharp)
DARK_MAX = 60.0  # mean brightness below this = too dark
BAD_SHARE = 0.5  # warn if more than half of sampled frames fail


def _frames(path: str, every_s: float = 1.0, max_frames: int = 60):
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        return
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(int(fps * every_s), 1)
    i = n = 0
    try:
        while n < max_frames:
            ok, frame = cap.read()
            if not ok:
                break
            if i % step == 0:
                yield i / fps, frame
                n += 1
            i += 1
    finally:
        cap.release()


def frame_quality(frame: np.ndarray) -> tuple[float, float]:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var()), float(gray.mean())


def check_video(path: str) -> dict:
    blurs, darks, total = 0, 0, 0
    for _, f in _frames(path, every_s=0.5):
        sharp, bright = frame_quality(f)
        total += 1
        blurs += sharp < BLUR_MIN
        darks += bright < DARK_MAX
    warnings = []
    if total == 0:
        return {"ok": False, "frames_checked": 0, "warnings": ["We couldn't read that video. Try recording again."]}
    if blurs / total > BAD_SHARE:
        warnings.append("Parts of this video are blurry. Walk a little slower.")
    if darks / total > BAD_SHARE:
        warnings.append("It's too dark to see everything. Turn on a light or open the blinds.")
    return {"ok": not warnings, "frames_checked": total, "warnings": warnings}


def check_image(data: bytes) -> list[str]:
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return ["We couldn't read that photo."]
    sharp, bright = frame_quality(img)
    out = []
    if sharp < BLUR_MIN:
        out.append("This photo is blurry. Hold the phone steady and retake it.")
    if bright < DARK_MAX:
        out.append("This photo is too dark. Add more light.")
    return out


def extract_jpeg_frames(path: str, every_s: float = 1.0, max_frames: int = 40) -> list[tuple[float, bytes]]:
    out = []
    for ts, f in _frames(path, every_s=every_s, max_frames=max_frames):
        h, w = f.shape[:2]
        if w > 960:
            f = cv2.resize(f, (960, int(h * 960 / w)))
        ok, buf = cv2.imencode(".jpg", f, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if ok:
            out.append((ts, buf.tobytes()))
    return out


def frame_at(path: str, ts: float) -> bytes | None:
    cap = cv2.VideoCapture(path)
    try:
        cap.set(cv2.CAP_PROP_POS_MSEC, max(ts, 0) * 1000)
        ok, f = cap.read()
        if not ok:
            return None
        ok, buf = cv2.imencode(".jpg", f, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return buf.tobytes() if ok else None
    finally:
        cap.release()
