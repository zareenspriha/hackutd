"""Pillar 1 (State Farm): Room Scanner, Claim Tracker, damage photos, receipts."""
from __future__ import annotations

import os
import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel

from ..config import get_settings
from ..engine.claim import apply_ale_rule, claim_summary
from ..engine.compare import compare_items
from ..engine.valuation import value_item
from ..models import DamageLine, Item, Receipt, RoomScan
from ..services import cv_checks
from ..services.gemini import get_gemini
from .deps import commit, load

router = APIRouter(prefix="/households/{household_id}", tags=["prove (State Farm)"])

MAX_VIDEO_MB = 200
MAX_IMAGE_MB = 15


async def _save_upload(f: UploadFile, household_id: str, max_mb: int) -> str:
    folder = os.path.join(get_settings().upload_dir, household_id)
    os.makedirs(folder, exist_ok=True)
    ext = os.path.splitext(f.filename or "")[1].lower() or ".mp4"
    path = os.path.join(folder, f"{uuid.uuid4().hex}{ext}")
    size = 0
    with open(path, "wb") as out:
        while chunk := await f.read(1 << 20):
            size += len(chunk)
            if size > max_mb * 1024 * 1024:
                out.close()
                os.remove(path)
                raise HTTPException(413, f"File is larger than {max_mb} MB")
            out.write(chunk)
    return path


@router.post("/scan")
async def scan_room(
    household_id: str,
    room: str = Form(...),
    phase: Literal["before", "after"] = Form(...),
    video: UploadFile = File(...),
):
    """Upload a 30-second room video. Returns the item list, quality warnings, and (for 'after') the loss list."""
    h = await load(household_id)
    if phase == "after" and not any(s.room == room and s.phase == "before" for s in h.scans):
        raise HTTPException(400, f"No 'before' video for {room}. Record the before video first.")
    path = await _save_upload(video, household_id, MAX_VIDEO_MB)
    quality = cv_checks.check_video(path)
    g, method = await get_gemini().analyze_room(path, room, phase)
    items = [value_item(Item(room=room, **gi.model_dump())) for gi in g.items]
    rs = RoomScan(room=room, phase=phase, items=items, missing_areas=g.missing_areas,
                  quality_warnings=quality["warnings"], video_path=path)
    h.scans = [s for s in h.scans if not (s.room == room and s.phase == phase)] + [rs]

    new_losses = []
    if phase == "after":
        before = next(s for s in h.scans if s.room == room and s.phase == "before")
        new_losses = compare_items(before.items, items)
        h.claim.losses = [l for l in h.claim.losses if l.room != room] + new_losses
    await commit(h)
    return {
        "room": room, "phase": phase, "analysis_method": method,
        "items": [i.model_dump() for i in items],
        "inventory_total": round(sum(i.replacement_cost for i in items), 2),
        "missing_areas": g.missing_areas, "quality": quality,
        "losses": [l.model_dump() for l in new_losses],
        "loss_total": round(sum(l.replacement_cost for l in new_losses), 2),
    }


@router.get("/frame")
async def get_frame(household_id: str, room: str, phase: Literal["before", "after"], ts: float):
    """JPEG of the video at `ts` seconds, for before/after proof frames."""
    h = await load(household_id)
    s = next((s for s in h.scans if s.room == room and s.phase == phase), None)
    if not s or not s.video_path or not os.path.exists(s.video_path):
        raise HTTPException(404, "No video stored for that room and phase")
    jpg = cv_checks.frame_at(s.video_path, ts)
    if jpg is None:
        raise HTTPException(404, "Couldn't read a frame at that time")
    return Response(content=jpg, media_type="image/jpeg")


class LossEdit(BaseModel):
    index: int
    name: str | None = None
    replacement_cost: float | None = None
    actual_cash_value: float | None = None
    status: Literal["missing", "damaged", "destroyed"] | None = None
    remove: bool = False
    confirmed: bool = True


class LossReview(BaseModel):
    edits: list[LossEdit] = []
    confirm_all_in_room: str | None = None


@router.post("/losses/review")
async def review_losses(household_id: str, body: LossReview):
    """The family fixes and confirms the loss list before it enters the Claim Tracker."""
    h = await load(household_id)
    remove = set()
    for e in body.edits:
        if not 0 <= e.index < len(h.claim.losses):
            raise HTTPException(400, f"No loss item at index {e.index}")
        l = h.claim.losses[e.index]
        if e.remove:
            remove.add(e.index)
            continue
        for field in ("name", "replacement_cost", "actual_cash_value", "status"):
            v = getattr(e, field)
            if v is not None:
                setattr(l, field, v)
        l.confirmed = e.confirmed
    if body.confirm_all_in_room:
        for l in h.claim.losses:
            if l.room == body.confirm_all_in_room:
                l.confirmed = True
    h.claim.losses = [l for i, l in enumerate(h.claim.losses) if i not in remove]
    await commit(h)
    return claim_summary(h)


@router.post("/damage-photo")
async def add_damage_photo(household_id: str, photo: UploadFile = File(...)):
    h = await load(household_id)
    path = await _save_upload(photo, household_id, MAX_IMAGE_MB)
    data = open(path, "rb").read()
    warnings = cv_checks.check_image(data)
    d = await get_gemini().read_damage(data, photo.content_type or "image/jpeg")
    line = DamageLine(**d.model_dump(), photo_path=path)
    h.claim.damage.append(line)
    await commit(h)
    return {"line": line.model_dump(), "quality_warnings": warnings, "claim": claim_summary(h)}


@router.post("/receipt")
async def add_receipt(household_id: str, photo: UploadFile = File(...)):
    """Gemini reads the receipt; code applies the 'only costs above normal spending count' rule."""
    h = await load(household_id)
    path = await _save_upload(photo, household_id, MAX_IMAGE_MB)
    data = open(path, "rb").read()
    g = await get_gemini().read_receipt(data, photo.content_type or "image/jpeg")
    r = apply_ale_rule(h, Receipt(**g.model_dump(), photo_path=path))
    h.claim.receipts.append(r)
    await commit(h)
    return {"receipt": r.model_dump(), "claim": claim_summary(h)}


class ReceiptIn(BaseModel):
    merchant: str
    category: Literal["food", "lodging", "transport", "other"]
    total: float
    days_covered: int = 7


@router.post("/receipt/manual")
async def add_receipt_manual(household_id: str, body: ReceiptIn):
    """Add a receipt typed in by hand (same 'above normal spending' rule as a photo)."""
    h = await load(household_id)
    r = apply_ale_rule(h, Receipt(**body.model_dump()))
    h.claim.receipts.append(r)
    await commit(h)
    return {"receipt": r.model_dump(), "claim": claim_summary(h)}


@router.get("/items")
async def items(household_id: str):
    """Every scanned item (from the 'before' videos), marked missing/damaged when it's on the loss list."""
    h = await load(household_id)
    losses = {(l.room, l.name): l for l in h.claim.losses}
    out = []
    for s in h.scans:
        if s.phase != "before":
            continue
        for i, it in enumerate(s.items):
            l = losses.get((s.room, it.name))
            out.append({
                "id": f"{s.room}:{i}", "room": s.room, "name": it.name, "category": it.category,
                "condition": "good" if l is None else ("missing" if l.status == "missing" else "damaged"),
                "replacement_cost": it.replacement_cost, "actual_cash_value": it.actual_cash_value,
                "before_frame_ts": it.frame_ts, "after_frame_ts": l.after_frame_ts if l else None,
                "has_video": bool(s.video_path),
            })
    return {"items": out}


@router.get("/compare")
async def compare_room(household_id: str, room: str | None = None):
    """Before vs after for one room, item by item, for the What changed screen.
    Rooms with both scans are listed; without `room`, the room with unreviewed losses (or the newest) is used."""
    h = await load(household_id)
    rooms = [r for r in dict.fromkeys(s.room for s in h.scans if s.phase == "after")
             if any(s.room == r and s.phase == "before" for s in h.scans)]
    if not rooms:
        return {"rooms": [], "room": None}
    if room not in rooms:
        pending = [l.room for l in h.claim.losses if not l.confirmed and l.room in rooms]
        room = pending[-1] if pending else rooms[0]
    before = next(s for s in h.scans if s.room == room and s.phase == "before")
    after = next(s for s in h.scans if s.room == room and s.phase == "after")
    losses = {l.name: (i, l) for i, l in enumerate(h.claim.losses) if l.room == room}
    items = []
    for it in before.items:
        idx_l = losses.get(it.name)
        if idx_l:
            i, l = idx_l
            items.append({"name": it.name, "category": it.category, "status": l.status,
                          "replacement_cost": l.replacement_cost, "actual_cash_value": l.actual_cash_value,
                          "before_ts": l.before_frame_ts if l.before_frame_ts is not None else it.frame_ts,
                          "after_ts": l.after_frame_ts, "loss_index": i, "confirmed": l.confirmed})
        else:
            items.append({"name": it.name, "category": it.category, "status": "unchanged",
                          "replacement_cost": it.replacement_cost, "actual_cash_value": it.actual_cash_value,
                          "before_ts": it.frame_ts, "after_ts": None, "loss_index": None, "confirmed": True})
    claimable = [x for x in items if x["status"] != "unchanged"]

    def mid(s):  # a frame from the middle of the video for the full-room view
        ts = [i.frame_ts for i in s.items if i.frame_ts is not None]
        return round(sum(ts) / len(ts), 2) if ts else 1.0

    return {
        "rooms": rooms, "room": room, "items": items,
        "has_video": bool(before.video_path and after.video_path
                          and os.path.exists(before.video_path) and os.path.exists(after.video_path)),
        "before_ts": mid(before), "after_ts": mid(after),
        "loss_total": round(sum(x["replacement_cost"] for x in claimable), 2),
        "unconfirmed": sum(1 for x in claimable if not x["confirmed"]),
        "quality_warnings": after.quality_warnings,
    }


@router.get("/claim")
async def get_claim(household_id: str):
    return claim_summary(await load(household_id))


@router.post("/claim/file")
async def file_claim(household_id: str):
    h = await load(household_id)
    h.claim.filed = True
    h.claim.filed_on = date.today()
    h.outreach_unanswered = False
    h.days_since_last_activity = 0  # first contact with the insurer
    await commit(h)
    return claim_summary(h)
