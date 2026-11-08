from fastapi import HTTPException, Query

from ..engine.disaster import label_bills
from ..engine.priority import score
from ..models import Household, Scenario
from ..store import get_store


async def load(household_id: str) -> Household:
    h = await get_store().get(household_id)
    if h is None:
        raise HTTPException(404, f"Household '{household_id}' not found")
    return h


async def commit(h: Household, activity: bool = True) -> Household:
    """Re-label bills, re-score for the insurer map, and save. Call after every change.

    activity=True means the family just did something in the app, so they are no longer "quiet"
    and responders see their score update live.
    """
    if activity:
        h.days_since_last_activity = 0
        h.outreach_unanswered = False
    if h.disaster_mode:
        label_bills(h)
    score(h)
    await get_store().save(h)
    return h


def scenario(
    claim_delay_days: int | None = Query(None, ge=1, le=120, description="What if the claim pays on this day instead"),
    payout_pct: float = Query(1.0, ge=0.0, le=1.0, description="What if insurance pays only this share"),
    missed_work_days: int = Query(0, ge=0, le=60, description="What if I miss this many work days"),
    mortgage_pause: bool = Query(False, description="What if the lender pauses one mortgage payment"),
) -> Scenario:
    return Scenario(claim_delay_days=claim_delay_days, payout_pct=payout_pct, missed_work_days=missed_work_days,
                    mortgage_pause=mortgage_pause)
