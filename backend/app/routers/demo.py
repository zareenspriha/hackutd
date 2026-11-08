"""Presenter controls (Shift+D in the app). Each one changes the real household so every screen updates."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from ..engine.disaster import set_disaster_mode
from ..engine.valuation import value_item
from ..engine.compare import compare_items
from ..models import Item, RoomScan
from ..seed import seed
from ..services.gemini import get_gemini
from .deps import commit, load

router = APIRouter(prefix="/demo", tags=["meta"])
DEMO = "garcia"


@router.post("/reset")
async def demo_reset():
    """Reset everything to the starting demo state (run before each rehearsal)."""
    return await seed(force=True)


@router.post("/disaster")
async def disaster():
    """Disaster strikes: Disaster Mode on (late fees paused, bills relabeled)."""
    h = await load(DEMO)
    set_disaster_mode(h, True)
    await commit(h, activity=False)
    return {"disaster_mode": True}


@router.post("/delay-paycheck")
async def delay_paycheck(days: int = Query(14, ge=0, le=60)):
    """The employer closed after the storm: the next paycheck arrives `days` late (0 undoes it)."""
    h = await load(DEMO)
    h.paycheck_delay_days = days
    await commit(h, activity=False)
    return {"paycheck_delay_days": days}


@router.post("/scan")
async def preset_scan(phase: Literal["before", "after"], room: str = "Living room"):
    """Load a canned room scan without recording a video (works with the mock analyzer only)."""
    g = get_gemini()
    if not g.mock:
        raise HTTPException(400, "Preset scans need the mock analyzer. Record a real video instead.")
    h = await load(DEMO)
    if phase == "after" and not any(s.room == room and s.phase == "before" for s in h.scans):
        raise HTTPException(400, f"Load the before scan for {room} first.")
    res, _ = await g.analyze_room("", room, phase)
    items = [value_item(Item(room=room, **gi.model_dump())) for gi in res.items]
    from datetime import date

    from .prove import _with_scan

    h.scans = _with_scan(h.scans, RoomScan(room=room, phase=phase, items=items, missing_areas=res.missing_areas,
                                           taken_on=date.today()))
    losses = []
    if phase == "after":
        before = h.latest_scan(room, "before")
        losses = compare_items(before.items, items)
        h.claim.losses = [l for l in h.claim.losses if l.room != room] + losses
    await commit(h)
    return {"room": room, "phase": phase, "items": len(items), "losses": len(losses)}
