"""Insurer view (State Farm): Recovery Priority Map across all households. Reasons, never balances."""
from fastapi import APIRouter, Query

from ..engine.priority import public_view, score
from ..store import get_store
from .deps import load

router = APIRouter(prefix="/insurer", tags=["insurer map (State Farm)"])


@router.get("/households")
async def ranked(limit: int = Query(2002, ge=1, le=5000)):
    hs = await get_store().top_priority(limit)
    return {"count": len(hs), "households": [public_view(h, i + 1) for i, h in enumerate(hs)]}


@router.get("/households/{household_id}")
async def one(household_id: str):
    h = score(await load(household_id))
    hs = await get_store().top_priority(5000)
    rank = next((i + 1 for i, x in enumerate(hs) if x.id == h.id), None)
    return public_view(h, rank)


@router.get("/summary")
async def summary():
    hs = await get_store().top_priority(5000)
    urgent = [h for h in hs if h.priority_score >= 60]
    return {
        "households": len(hs),
        "urgent": len(urgent),
        "no_claim_started": sum(1 for h in hs if not h.claim.filed),
        "adjuster_queue": [public_view(h, i + 1) for i, h in enumerate(hs[:25])],
    }
