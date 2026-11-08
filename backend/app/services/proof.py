"""Proof photos: real frames from the family's own videos, zoomed on each item, before and after.

1. Every video is decoded once into real frames (cv_checks.index_frames).
2. Each item's timestamp snaps to the sharpest real frame near it, and Gemini draws a box around it there.
3. For a missing item, ORB feature matching finds the after-video frame showing the same spot, and a
   homography moves the box there, so the family (and the adjuster) see the exact empty spot.
"""
from __future__ import annotations

import asyncio
import logging
import os
from collections import defaultdict

from ..engine.compare import _similar
from ..models import Household, RoomScan
from . import cv_checks
from .gemini import get_gemini

log = logging.getLogger("looma.proof")
MAX_LOOKUPS = 8  # Gemini box calls per scan (one per distinct frame)


def _has_video(s: RoomScan | None) -> bool:
    return bool(s and s.video_path and os.path.exists(s.video_path))


async def prepare_scan(s: RoomScan) -> None:
    """Index frames, snap item times to real frames, and find each item's box."""
    if not _has_video(s):
        return
    frames = await asyncio.to_thread(cv_checks.index_frames, s.video_path)
    if not frames:
        return
    groups: dict[float, list] = defaultdict(list)
    for it in s.items:
        fr = cv_checks.nearest(s.video_path, it.frame_ts or 0.0)
        it.frame_ts = fr["ts"]
        groups[it.frame_ts].append(it)
    g = get_gemini()
    todo = sorted(groups.items(), key=lambda kv: -len(kv[1]))[:MAX_LOOKUPS]

    async def one(ts, items):
        got = await asyncio.to_thread(cv_checks.frame_jpeg, s.video_path, ts)
        if not got:
            return
        boxes = await g.locate(got[1], [i.name for i in items])
        for i in items:
            b = boxes.get(i.name.strip().lower())
            if b is None:  # Gemini sometimes shortens names
                b = next((v for k, v in boxes.items() if _similar(k, i.name) >= 0.8), None)
            i.box = b

    await asyncio.gather(*(one(ts, items) for ts, items in todo))
    s.proof_ready = True


async def line_up_losses(h: Household, room: str) -> None:
    """Give every loss in the room a before photo and the matching after photo of the same spot."""
    before, after = h.latest_scan(room, "before"), h.latest_scan(room, "after")
    if not _has_video(before) or not _has_video(after):
        return
    by_name = {i.name: i for i in before.items}
    for l in h.claim.losses:
        if l.room != room:
            continue
        b = by_name.get(l.name)
        if b:
            l.before_frame_ts, l.before_box = b.frame_ts, b.box
        if l.status != "missing":
            a = max(after.items, key=lambda x: _similar(x.name, l.name), default=None)
            if a and _similar(a.name, l.name) >= 0.6:
                l.after_frame_ts, l.after_box = a.frame_ts, a.box
                continue
        if l.before_frame_ts is None:
            continue
        m = await asyncio.to_thread(cv_checks.match_view, before.video_path, l.before_frame_ts, after.video_path)
        if m:
            l.after_frame_ts = m["ts"]
            l.after_box = cv_checks.map_box(l.before_box, m) if l.before_box else None


async def ensure_room(h: Household, room: str) -> bool:
    """Backfill proof for scans recorded before this existed. Returns True if anything changed."""
    changed = False
    for phase in ("before", "after"):
        s = h.latest_scan(room, phase)
        if _has_video(s) and not s.proof_ready:
            await prepare_scan(s)
            changed = True
    if changed:
        await line_up_losses(h, room)
    return changed
