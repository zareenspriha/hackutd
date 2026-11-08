"""Insurer view (State Farm): Recovery Priority Map across all households. Reasons, never balances.

Responders coordinate here: assign a household, reach out, or check on every silent household at once.
Every responder action is signed (X-Staff) and shows up in that family's own activity, so families
can see who looked at their file and why.
"""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..engine.priority import public_view, score
from ..models import Outreach
from ..store import get_store
from .deps import commit, load, note, now, staff

router = APIRouter(prefix="/insurer", tags=["insurer map (State Farm)"])

URGENT = 60
SILENT = 15  # silence points above this = no claim and no word from the family


@router.get("/households")
async def ranked(limit: int = Query(2002, ge=1, le=5000)):
    hs = await get_store().top_priority(limit)
    return {"count": len(hs), "households": [public_view(h, i + 1) for i, h in enumerate(hs)]}


@router.get("/households/{household_id}")
async def one(household_id: str, by: str = Depends(staff)):
    h = score(await load(household_id))
    hs = await get_store().top_priority(5000)
    rank = next((i + 1 for i, x in enumerate(hs) if x.id == h.id), None)
    if not h.synthetic:
        note(h, f"Responder {by}", "Opened your file (priority and reasons only, never balances)")
        await commit(h, activity=False)
    return {**public_view(h, rank), "outreach": [o.model_dump() for o in h.outreach[-5:]]}


def _coverage(hs) -> dict:
    urgent = [h for h in hs if h.priority_score >= URGENT]
    reached = [h for h in urgent if h.outreach or h.claim.filed or h.check_in]
    overlooked = [h for h in urgent if not h.outreach and not h.claim.filed and not h.check_in]
    return {
        "urgent": len(urgent),
        "urgent_reached": len(reached),
        "coverage_pct": round(100 * len(reached) / len(urgent)) if urgent else 100,
        "overlooked": len(overlooked),
        "asked_for_help": sum(1 for h in hs if h.check_in and (not h.check_in.safe or h.check_in.needs)),
    }


@router.get("/summary")
async def summary():
    hs = await get_store().top_priority(5000)
    return {
        "households": len(hs),
        "no_claim_started": sum(1 for h in hs if not h.claim.filed),
        **_coverage(hs),
        "adjuster_queue": [public_view(h, i + 1) for i, h in enumerate(hs[:25])],
    }


class ReachIn(BaseModel):
    kind: Literal["check_in", "bridge_offer"] = "check_in"
    note: str = Field("", max_length=280)


MESSAGES = {
    "check_in": "Checking on you after the disaster. Are you safe? Reply in looma or call us anytime.",
    "bridge_offer": "You may qualify for Bridge Funds to cover costs until your claim pays. Open looma to see your amount.",
}


@router.post("/households/{household_id}/reach-out")
async def reach_out(household_id: str, body: ReachIn, by: str = Depends(staff)):
    """A responder messages one family. The family sees it on their home screen."""
    h = await load(household_id)
    msg = body.note.strip() or MESSAGES[body.kind]
    h.outreach.append(Outreach(ts=now(), by=by, kind=body.kind, note=msg))
    h.outreach_unanswered = True
    note(h, f"Responder {by}", f"Sent you a message: {msg}")
    await commit(h, activity=False)
    return public_view(h)


class AssignIn(BaseModel):
    to: str = Field(min_length=1, max_length=60)


@router.post("/households/{household_id}/assign")
async def assign(household_id: str, body: AssignIn, by: str = Depends(staff)):
    """Give one adjuster ownership of a household so no family is handled twice, or not at all."""
    h = await load(household_id)
    if h.assigned_to and h.assigned_to != body.to:
        prev = h.assigned_to
    else:
        prev = None
    h.assigned_to = body.to.strip()
    h.outreach.append(Outreach(ts=now(), by=by, kind="assign", note=f"{h.assigned_to} is your adjuster now."))
    note(h, f"Responder {by}", f"Assigned {h.assigned_to} as your adjuster" + (f" (was {prev})" if prev else ""))
    await commit(h, activity=False)
    return public_view(h)


@router.post("/sweep")
async def sweep(by: str = Depends(staff), min_score: float = Query(URGENT, ge=0, le=100)):
    """No one overlooked: send a check-in to every urgent household nobody has reached yet."""
    store = get_store()
    hs = await store.top_priority(5000)
    targets = [h for h in hs if h.priority_score >= min_score and not h.outreach and not h.claim.filed and not h.check_in]
    for h in targets:
        h.outreach.append(Outreach(ts=now(), by=by, kind="sweep", note=MESSAGES["check_in"]))
        note(h, f"Responder {by}", "Sent an automatic check-in to everyone not yet reached")
    if targets:
        await store.save_many(targets)
    after = await store.top_priority(5000)
    return {"reached": len(targets), **_coverage(after)}


@router.get("/households/{household_id}/outreach")
async def outreach_log(household_id: str, by: str = Depends(staff)):
    h = await load(household_id)
    if not h:
        raise HTTPException(404)
    return {"outreach": [o.model_dump() for o in h.outreach]}
