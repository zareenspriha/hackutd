"""Family side of coordination and trust: 'Are you safe?', privacy choice, messages, and the activity log."""
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..models import CheckIn
from .deps import commit, load, note, now

router = APIRouter(prefix="/households/{household_id}", tags=["family trust and safety"])

Need = Literal["shelter", "food", "cash", "transport", "medical", "power"]


class CheckInIn(BaseModel):
    safe: bool
    needs: list[Need] = Field(default_factory=list, max_length=6)


@router.post("/check-in")
async def check_in(household_id: str, body: CheckInIn):
    """'Are you safe?' The answer goes straight to responders and can only raise the family's priority."""
    h = await load(household_id)
    needs = sorted(set(body.needs))
    h.check_in = CheckIn(ts=now(), safe=body.safe, needs=needs)
    note(h, "You", ("Told responders you're safe" if body.safe else "Asked responders for urgent help")
         + (f": {', '.join(needs)}" if needs else ""))
    await commit(h)
    return {"check_in": h.check_in.model_dump(), "priority_reasons": h.priority_reasons}


class PrivacyIn(BaseModel):
    share_hardship: bool


@router.post("/privacy")
async def privacy(household_id: str, body: PrivacyIn):
    """Choose whether responders may use hardship signals (low savings, card usage) to rank you.
    Responders never see balances either way."""
    h = await load(household_id)
    h.fragility_opt_in = body.share_hardship
    note(h, "You", "Shared hardship signals with responders" if body.share_hardship else "Stopped sharing hardship signals")
    await commit(h)
    return {"share_hardship": h.fragility_opt_in}


@router.get("/activity")
async def activity(household_id: str, limit: int = 40):
    """Everything that happened to this household's file and money, newest first, plus messages from responders."""
    h = await load(household_id)
    return {
        "events": [e.model_dump() for e in reversed(h.activity[-limit:])],
        "messages": [o.model_dump() for o in reversed(h.outreach)][:10],
        "assigned_to": h.assigned_to,
        "check_in": h.check_in.model_dump() if h.check_in else None,
        "share_hardship": h.fragility_opt_in,
        "responders_see": ["Your priority score and the reasons for it", "Your ZIP code and map location",
                           "Whether your claim is started", "Your answer to 'Are you safe?'"],
        "responders_never_see": ["Balances or account numbers", "Purchases", "Your Help circle"],
    }
