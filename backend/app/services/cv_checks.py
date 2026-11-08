"""OpenCV: blur and brightness checks, frame extraction, and the before/after proof photos.

Browser recordings (MediaRecorder .webm) have no seek index, so seeking returns the first (black) frame.
Every video is therefore decoded once, in order, into a folder of real frames (`<video>.frames/`), and all
proof photos come from there. Before/after views of the same spot are lined up with ORB feature matching
and a homography, so a missing item's box can be drawn where it used to be in the after video.
"""
from __future__ import annotations

import json
import os

import cv2
import numpy as np

FRAME_STEP_S = 0.5  # one stored frame every half second
BLACK_MAX = 18.0  # frames darker than this (camera warming up) are skipped
MAX_W = 960

BLUR_MIN = 20.0  # Laplacian variance below this = blurry (tuned on real phone video: plain walls score ~15-40 even when sharp)
DARK_MAX = 60.0  # mean brightness below this = too dark
BAD_SHARE = 0.5  # warn if more than half of sampled frames fail


def _frames(path: str, every_s: float = 1.0, max_frames: int = 60):
    """Frames in order with their real timestamps (container fps is often wrong for browser recordings)."""
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        return
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    if not 1 <= fps <= 120:  # browser-recorded webm often reports 0 or 1000 fps
        fps = 30.0
    i = n = 0
    next_ts = 0.0
    try:
        while n < max_frames:
            ok, frame = cap.read()
            if not ok:
                break
            ms = cap.get(cv2.CAP_PROP_POS_MSEC)
            ts = ms / 1000 if ms and ms > 0 else i / fps
            if ts + 1e-6 >= next_ts:
                yield ts, frame
                n += 1
                next_ts = ts + every_s
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


# ---------- stored frames ----------

def _folder(path: str) -> str:
    return path + ".frames"


def _brighten(f: np.ndarray) -> np.ndarray:
    """Gentle auto-exposure for dim rooms (CLAHE on lightness), so proof photos are readable."""
    lab = cv2.cvtColor(f, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(l)
    return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)


def index_frames(path: str) -> list[dict]:
    """Decode the video once and keep a real frame every half second (skipping black ones). Cached on disk."""
    folder = _folder(path)
    idx = os.path.join(folder, "index.json")
    if os.path.exists(idx):
        with open(idx) as fh:
            return json.load(fh)
    os.makedirs(folder, exist_ok=True)
    out = []
    for ts, f in _frames(path, every_s=FRAME_STEP_S, max_frames=240):
        sharp, bright = frame_quality(f)
        if bright < BLACK_MAX:
            continue
        h, w = f.shape[:2]
        if w > MAX_W:
            f = cv2.resize(f, (MAX_W, int(h * MAX_W / w)))
        if bright < 70:
            f = _brighten(f)
        name = f"{int(ts * 1000):07d}.jpg"
        cv2.imwrite(os.path.join(folder, name), f, [cv2.IMWRITE_JPEG_QUALITY, 85])
        out.append({"ts": round(ts, 2), "file": name, "sharp": round(sharp, 1), "bright": round(bright, 1)})
    with open(idx, "w") as fh:
        json.dump(out, fh)
    return out


def nearest(path: str, ts: float, window: float = 1.0) -> dict | None:
    """The stored frame closest to ts; within `window` seconds, prefer the sharpest one."""
    frames = index_frames(path)
    if not frames:
        return None
    near = [f for f in frames if abs(f["ts"] - ts) <= window] or [min(frames, key=lambda f: abs(f["ts"] - ts))]
    return max(near, key=lambda f: f["sharp"] - 20 * abs(f["ts"] - ts))


def _read(path: str, frame: dict) -> np.ndarray | None:
    return cv2.imread(os.path.join(_folder(path), frame["file"]))


def _px(box: list[float], w: int, h: int) -> tuple[int, int, int, int]:
    y0, x0, y1, x1 = box
    return int(x0 / 1000 * w), int(y0 / 1000 * h), int(x1 / 1000 * w), int(y1 / 1000 * h)


def frame_at(path: str, ts: float, box: list[float] | None = None, mode: str = "full") -> bytes | None:
    """JPEG of the real frame nearest ts. mode 'crop' zooms on the box; 'mark' outlines it on the full frame."""
    fr = nearest(path, ts)
    if not fr:
        return None
    f = _read(path, fr)
    if f is None:
        return None
    h, w = f.shape[:2]
    if box and len(box) == 4:
        x0, y0, x1, y1 = _px(box, w, h)
        if mode == "crop":
            bw, bh = max(x1 - x0, 1), max(y1 - y0, 1)
            side = int(max(bw, bh) * 1.35)
            side = max(side, min(w, h) // 4)
            cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
            side = min(side, w, h)
            ax, ay = min(max(cx - side // 2, 0), w - side), min(max(cy - side // 2, 0), h - side)
            f = cv2.resize(f[ay:ay + side, ax:ax + side], (320, 320))
        elif mode == "mark":
            overlay = f.copy()
            cv2.rectangle(overlay, (x0, y0), (x1, y1), (201, 223, 242), -1)
            f = cv2.addWeighted(overlay, 0.18, f, 0.82, 0)
            cv2.rectangle(f, (x0, y0), (x1, y1), (242, 241, 238), 3, lineType=cv2.LINE_AA)
    ok, buf = cv2.imencode(".jpg", f, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return buf.tobytes() if ok else None


def frame_jpeg(path: str, ts: float) -> tuple[float, bytes] | None:
    fr = nearest(path, ts)
    if not fr:
        return None
    with open(os.path.join(_folder(path), fr["file"]), "rb") as fh:
        return fr["ts"], fh.read()


# ---------- lining up before and after ----------

_orb = None


def _features(img: np.ndarray):
    global _orb
    if _orb is None:
        _orb = cv2.ORB_create(1500)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return _orb.detectAndCompute(gray, None)


def match_view(before_path: str, before_ts: float, after_path: str) -> dict | None:
    """Find the after-video frame that shows the same spot as the before frame (ORB + RANSAC homography).
    Returns {ts, H, inliers} or None when no frame lines up well enough."""
    bf = nearest(before_path, before_ts)
    if not bf:
        return None
    b_img = _read(before_path, bf)
    kb, db = _features(b_img)
    if db is None or len(kb) < 12:
        return None
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    best = None
    after_frames = [(af, _read(after_path, af)) for af in index_frames(after_path)]
    for af, a_img in after_frames:
        if a_img is None:
            continue
        ka, da = _features(a_img)
        if da is None or len(ka) < 12:
            continue
        pairs = matcher.knnMatch(db, da, k=2)
        good = [m for m, *n in pairs if n and m.distance < 0.75 * n[0].distance]
        if len(good) < 12:
            continue
        src = np.float32([kb[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
        dst = np.float32([ka[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
        H, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
        if H is None:
            continue
        inliers = int(mask.sum())
        if not best or inliers > best["inliers"]:
            best = {"ts": af["ts"], "H": H, "inliers": inliers, "size": b_img.shape[:2], "a_size": a_img.shape[:2]}
    return best if best and best["inliers"] >= 12 else None


def map_box(box: list[float], match: dict) -> list[int] | None:
    """Move a before-frame box into the matched after frame (normalized 0-1000)."""
    (h, w), (ah, aw) = match["size"], match["a_size"]
    x0, y0, x1, y1 = _px(box, w, h)
    pts = np.float32([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]).reshape(-1, 1, 2)
    q = cv2.perspectiveTransform(pts, match["H"]).reshape(-1, 2)
    nx0, ny0 = max(q[:, 0].min(), 0), max(q[:, 1].min(), 0)
    nx1, ny1 = min(q[:, 0].max(), aw), min(q[:, 1].max(), ah)
    if nx1 - nx0 < 8 or ny1 - ny0 < 8:
        return None
    return [int(ny0 / ah * 1000), int(nx0 / aw * 1000), int(ny1 / ah * 1000), int(nx1 / aw * 1000)]
