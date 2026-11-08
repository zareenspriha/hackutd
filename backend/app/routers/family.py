"""Family side of coordination and trust: 'Are you safe?', privacy choice, messages, and the activity log."""
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..models import CheckIn
from ..store import get_store
from .deps import commit, load, note, now

router = APIRouter(prefix="/households/{household_id}", tags=["family trust and safety"])

Need = Literal["shelter", "food", "cash", "transport", "medical", "power"]


class CheckInIn(BaseModel):
    safe: bool
    needs: list[Need] = Field(default_factory=list, max_length=6)
    note: str = Field("", max_length=200)
    lat: float | None = Field(None, ge=-90, le=90, description="Current location, only if the family chooses to share it")
    lng: float | None = Field(None, ge=-180, le=180)


async def _rank(h) -> tuple[int | None, int]:
    hs = await get_store().top_priority(5000)
    return next((i + 1 for i, x in enumerate(hs) if x.id == h.id), None), len(hs)


@router.post("/check-in")
async def check_in(household_id: str, body: CheckInIn):
    """'Are you safe?' The answer goes straight to responders and can only raise the family's priority."""
    h = await load(household_id)
    rank_before, _ = await _rank(h)
    needs = sorted(set(body.needs))
    shared = body.lat is not None and body.lng is not None
    h.check_in = CheckIn(ts=now(), safe=body.safe, needs=needs, note=body.note.strip(),
                         place="Current location (shared by you)" if shared else "Home address on file",
                         lat=body.lat if shared else None, lng=body.lng if shared else None)
    note(h, "You", ("Told responders you're safe" if body.safe else "Asked responders for urgent help")
         + (f": {', '.join(needs)}" if needs else "") + (" and shared your location" if shared else ""))
    await commit(h)
    return {"check_in": h.check_in.model_dump(), "priority_reasons": h.priority_reasons,
            "rank_before": rank_before, **(await help_status(household_id))}


# What the family can do themselves while a responder gets to them. Only real, safe actions:
# in-app steps backed by our own math, 911 for emergencies, and 2-1-1 (free local help line in the US).
SELF_HELP = {
    "shelter": ("A place to stay", "Hotel costs above your normal housing count toward your claim. Keep every receipt.", "ask", "Can I afford a hotel for two weeks?"),
    "food": ("Food", "Food above your normal grocery spending counts toward your claim. Snap the receipts.", "claim", None),
    "cash": ("Cash", "", "fund", None),
    "transport": ("A ride", "Call 2-1-1 for free local rides to shelters and aid centers.", None, None),
    "medical": ("Medical care", "If it's urgent, call 911 now. Keep pharmacy receipts; they count toward your claim.", None, None),
    "power": ("Power or phone charging", "Call 2-1-1 to find the nearest charging or cooling center.", None, None),
}


@router.get("/help-status")
async def help_status(household_id: str):
    """Where the family's request for help stands: sent, seen by a responder, assigned, answered.
    Every step comes from real events on the file, never a guess."""
    h = await load(household_id)
    ci = h.check_in
    rank, total = await _rank(h)
    if not ci:
        return {"check_in": None, "rank": rank, "of": total, "timeline": [], "self_help": []}
    seen = next((e for e in h.activity if e.ts >= ci.ts and e.actor.startswith("Responder") and "Opened your file" in e.text), None)
    assign = next((o for o in reversed(h.outreach) if o.kind == "assign"), None)
    reply = next((o for o in reversed(h.outreach) if o.ts >= ci.ts and o.kind != "assign"), None)
    timeline = [
        {"id": "sent", "label": "Sent to responders", "done": True, "ts": ci.ts,
         "detail": f"You're #{rank} of {total:,} households on their list." if rank else ""},
        {"id": "seen", "label": "A responder opened your file", "done": bool(seen), "ts": seen.ts if seen else None,
         "detail": seen.actor.removeprefix("Responder ") if seen else "Most urgent households are opened first."},
        {"id": "assigned", "label": "Someone is assigned to you", "done": bool(h.assigned_to), "ts": assign.ts if assign else None,
         "detail": h.assigned_to or "You'll see their name here."},
        {"id": "reply", "label": "They reached out", "done": bool(reply), "ts": reply.ts if reply else None,
         "detail": reply.note if reply else "Their message shows on this page. Real responders never ask for fees or your PIN."},
    ]
    from ..engine.bridge import available_bridge

    self_help = []
    for n in ci.needs:
        label, text, go, ask = SELF_HELP[n]
        if n == "cash":
            b = available_bridge(h)
            text = (f"${b:,.0f} in Bridge Funds is ready now, repaid from your insurance payout." if b
                    else "File your claim to unlock Bridge Funds. Working ATMs near you are on the Help circle page.")
            go = "fund" if b else ("claim" if not h.claim.filed else "circle")
        self_help.append({"need": n, "label": label, "text": text, "go": go, "ask": ask})
    return {"check_in": ci.model_dump(), "rank": rank, "of": total, "timeline": timeline, "self_help": self_help,
            "location": {"place": ci.place, "lat": ci.lat if ci.lat is not None else h.lat,
                         "lng": ci.lng if ci.lng is not None else h.lng, "zip": h.zip}}


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
                           "Whether your claim is started", "Your answer to 'Are you safe?' and what you need",
                           "Your current location, only if you choose to share it"],
        "responders_never_see": ["Balances or account numbers", "Purchases", "Your Help circle"],
    }
