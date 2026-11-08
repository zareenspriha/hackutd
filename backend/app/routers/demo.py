"""Presenter controls (Shift+D in the app). Each one changes the real household so every screen updates."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from ..engine.disaster import set_disaster_mode
from ..engine.valuation import value_item
from ..engine.compare import compare_items
from ..engine.priority import score
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


@router.post("/fresh")
async def fresh():
    """Fast fresh start for a new person trying the demo (runs on every sign-in): the Garcias go back to
    day one (no claim, no Bridge Funds, no card, no help request, no messages, no extra scans), and every
    household's responder outreach is cleared. Keeps the same sandbox bank customer, so it takes a moment, not a reseed."""
    from ..data.synthetic import garcia
    from ..store import get_store

    store = get_store()
    old = await store.get(DEMO)
    g = garcia()
    if old:
        g.nessie_customer_id, g.nessie_checking_id = old.nessie_customer_id, old.nessie_checking_id
        g.nessie_savings_id, g.nessie_credit_id = old.nessie_savings_id, old.nessie_credit_id
    await commit(g, activity=False)
    others = [h for h in await store.top_priority(5000) if h.id != DEMO and (h.outreach or h.assigned_to)]
    for h in others:
        h.outreach, h.assigned_to = [], None
        score(h)
    if others:
        await store.save_many(others)
    return {"fresh": True, "cleared": len(others)}


@router.post("/storm")
async def storm():
    """Replay the storm on the responder map: clear earlier outreach and assignments so the
    "check on everyone not reached" sweep starts from zero. Claims, scans and money are untouched."""
    from ..store import get_store

    store = get_store()
    hs = await store.top_priority(5000)
    changed = []
    for h in hs:
        if h.outreach or h.assigned_to:  # "hasn't answered earlier outreach" stays: it's part of who they are
            h.outreach, h.assigned_to = [], None
            score(h)
            changed.append(h)
    if changed:
        await store.save_many(changed)
    g = await load(DEMO)
    set_disaster_mode(g, True)
    await commit(g, activity=False)
    return {"households": len(hs), "cleared": len(changed)}


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
