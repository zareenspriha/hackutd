"""Pillar 2 (Capital One): Bridge Funds, Disaster Mode, Help Circle, Cash Access, insurance payout. Uses Nessie."""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..data.synthetic import garcia_purchases
from ..engine.bridge import bridge_offer
from ..engine.disaster import bill_view, label_spending, set_disaster_mode
from ..engine.forecast import expected_payout
from ..models import CircleMember, HelpTransfer, Scenario
from ..services.nessie import get_nessie
from ..store import get_store
from .deps import commit, load, note

log = logging.getLogger("looma.fund")
router = APIRouter(prefix="/households/{household_id}", tags=["fund (Capital One)"])


async def _mirror(coro_fn, *args) -> str | None:
    """Mirror a money move to Nessie. A Nessie outage never blocks the family."""
    try:
        return await coro_fn(*args)
    except Exception as e:  # noqa: BLE001
        log.warning("Nessie call failed: %s", e)
        return None


@router.get("/bridge")
async def get_bridge(household_id: str):
    return bridge_offer(await load(household_id))


class DisburseIn(BaseModel):
    amount: float | None = Field(None, gt=0, description="How much to take now (defaults to the full offer)")


@router.post("/bridge/disburse")
async def disburse_bridge(household_id: str, body: DisburseIn | None = None):
    h = await load(household_id)
    offer = bridge_offer(h)
    if not offer["eligible"]:
        raise HTTPException(400, offer["reason"])
    amount = round(min(body.amount, offer["amount"]), 2) if body and body.amount else offer["amount"]
    nessie = get_nessie()
    txn = await _mirror(nessie.deposit, h.nessie_checking_id or "mock", amount, "Looma Bridge Funds advance")
    h.accounts.checking += amount
    h.bridge.amount = round(h.bridge.amount + amount if h.bridge.disbursed else amount, 2)
    h.bridge.disbursed = True
    note(h, "You", "Took Bridge Funds into checking", amount, txn)
    await commit(h)
    return {**bridge_offer(h), "checking": h.accounts.checking, "nessie_transaction_id": txn}


class DisasterToggle(BaseModel):
    on: bool = True


@router.post("/disaster-mode")
async def disaster_mode(household_id: str, body: DisasterToggle):
    h = set_disaster_mode(await load(household_id), body.on)
    note(h, "Your bank", "Disaster Mode on: late fees paused" if body.on else "Disaster Mode off")
    await commit(h)
    return {"disaster_mode": h.disaster_mode, "bills": bill_view(h)}


@router.get("/bills")
async def bills(household_id: str):
    h = await load(household_id)
    return {"disaster_mode": h.disaster_mode, "bills": bill_view(h)}


class BillAction(BaseModel):
    action: str = Field(pattern="^(pay|move)$")


@router.post("/bills/{bill_id}")
async def act_on_bill(household_id: str, bill_id: str, body: BillAction):
    h = await load(household_id)
    b = next((b for b in h.bills if b.id == bill_id), None)
    if not b:
        raise HTTPException(404, "Bill not found")
    if b.status != "pending":
        raise HTTPException(409, f"{b.payee} is already {'paid' if b.status == 'paid' else 'moved'}")
    if body.action == "pay":
        if h.accounts.checking < b.amount:
            raise HTTPException(400, "Not enough in checking. Ask the coach where to find the money.")
        txn = await _mirror(get_nessie().withdraw, h.nessie_checking_id or "mock", b.amount, f"Paid {b.payee}")
        h.accounts.checking -= b.amount
        b.status = "paid"
        note(h, "You", f"Paid {b.payee}", -b.amount, txn)
    else:
        b.status = "moved"
        note(h, "You", f"Moved {b.payee} until after the claim pays (no late fee in Disaster Mode)")
    await commit(h)
    return {"bills": bill_view(h), "checking": h.accounts.checking}


@router.post("/mortgage-pause")
async def request_mortgage_pause(household_id: str):
    """Records that the family asked the lender for a disaster pause (simulated as approved for one month)."""
    h = await load(household_id)
    h.mortgage_pause_requested = True
    note(h, "You", "Asked your lender for a one-month mortgage pause")
    await commit(h)
    return {"mortgage_pause_requested": True, "bills": bill_view(h)}


@router.get("/spending")
async def spending(household_id: str):
    """Recent purchases labeled essential or can-wait (from Nessie when connected)."""
    h = await load(household_id)
    nessie = get_nessie()
    rows = []
    if not nessie.mock and h.nessie_credit_id:
        try:
            for p in await nessie.list_purchases(h.nessie_credit_id):
                desc = p.get("description", "")
                cat = desc.split("–")[0].strip().lower()
                rows.append({"description": desc, "amount": p.get("amount", 0), "date": p.get("purchase_date"), "category": cat})
        except Exception as e:  # noqa: BLE001
            log.warning("Nessie purchases failed: %s", e)
    if not rows:
        rows = [{**p, "date": f"{p['days_ago']} days ago"} for p in garcia_purchases()[-6:]]
    return {"purchases": label_spending(rows)}


class HelpIn(BaseModel):
    from_name: str = Field(min_length=1, max_length=60)
    amount: float = Field(gt=0, le=5000)
    note: str = Field("", max_length=200)


@router.post("/help-circle")
async def help_circle(household_id: str, body: HelpIn):
    """A relative sends money (Nessie P2P transfer)."""
    h = await load(household_id)
    from_same = sum(t.amount for t in h.help_circle if t.from_name == body.from_name)
    if from_same + body.amount > 5000:
        raise HTTPException(400, "That's more than $5,000 from one person. Large gifts need a bank review first.")
    nessie = get_nessie()
    txn = None
    if not nessie.mock and h.nessie_checking_id:
        try:
            sender = await nessie.create_customer(body.from_name.split()[0], "HelpCircle", h.zip)
            sender_acct = await nessie.create_account(sender, "Checking", f"{body.from_name} Checking", body.amount + 100)
            txn = await nessie.transfer(sender_acct, h.nessie_checking_id, body.amount, f"Help Circle from {body.from_name}")
        except Exception as e:  # noqa: BLE001
            log.warning("Nessie P2P failed: %s", e)
    else:
        txn = await nessie.transfer("mock_sender", "mock_checking", body.amount, f"Help Circle from {body.from_name}")
    h.help_circle.append(HelpTransfer(**body.model_dump()))
    note(h, body.from_name, "Sent help to your checking", body.amount, txn)
    if not any(m.name == body.from_name for m in h.circle):
        h.circle.append(CircleMember(name=body.from_name, relation="Family"))
    h.accounts.checking += body.amount
    await commit(h)
    return {"received": body.amount, "from": body.from_name, "checking": h.accounts.checking,
            "help_circle_total": sum(t.amount for t in h.help_circle), "nessie_transaction_id": txn}


class InviteIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    relation: str = Field("Family", max_length=30)


def _circle_view(h) -> dict:
    sent = {}
    for t in h.help_circle:
        sent[t.from_name] = sent.get(t.from_name, 0) + t.amount
    return {
        "members": [{**m.model_dump(), "sent": round(sent.get(m.name, 0), 2)} for m in h.circle],
        "total": round(sum(sent.values()), 2),
    }


@router.get("/circle")
async def get_circle(household_id: str):
    """The family's Help circle: who they can ask, and who has sent money."""
    return _circle_view(await load(household_id))


@router.post("/circle")
async def add_to_circle(household_id: str, body: InviteIn):
    """Add someone to the Help circle."""
    h = await load(household_id)
    if any(m.name.lower() == body.name.strip().lower() for m in h.circle):
        raise HTTPException(409, f"{body.name} is already in your circle")
    h.circle.append(CircleMember(name=body.name.strip(), relation=body.relation.strip() or "Family"))
    note(h, "You", f"Added {body.name.strip()} to your Help circle")
    await commit(h)
    return _circle_view(h)


class AskIn(BaseModel):
    names: list[str] = Field(default_factory=list, max_length=20, description="Who to ask (empty = everyone not asked yet)")
    amount: float | None = Field(None, gt=0, le=5000)


@router.post("/circle/request")
async def request_help(household_id: str, body: AskIn | None = None):
    """Ask specific people in the circle for help. Only the people the family picks are marked as asked."""
    from .deps import now

    h = await load(household_id)
    wanted = {n.lower() for n in (body.names if body else [])}
    if wanted:
        picked = [m for m in h.circle if m.name.lower() in wanted]
    else:
        picked = [m for m in h.circle if not m.invited]
    if not picked:
        raise HTTPException(400, "Pick someone in your circle to ask.")
    ts = now()
    for m in picked:
        m.invited, m.asked_at = True, ts
    amt = body.amount if body and body.amount else None
    note(h, "You", f"Asked {', '.join(m.name for m in picked)} for help" + (f" (${amt:,.0f})" if amt else ""))
    await commit(h)
    return {**_circle_view(h), "asked": [m.name for m in picked], "link": f"https://looma.app/help/{h.id}"}


@router.get("/cash-access")
async def cash_access(household_id: str, km: float = 15, limit: int = 5):
    """Nearest working ATMs (Nessie ATMs when connected, plus simulated outages in the disaster zone)."""
    h = await load(household_id)
    nessie = get_nessie()
    atms: list[dict] = []
    if not nessie.mock:
        try:
            from ..store import haversine_km

            atms = [a for a in await nessie.atms() if haversine_km(h.lat, h.lng, a["lat"], a["lng"]) <= km]
        except Exception as e:  # noqa: BLE001
            log.warning("Nessie ATMs failed: %s", e)
    local = await get_store().nearby_atms(h.lat, h.lng, km, 50)
    if atms:
        from ..store import haversine_km

        for a in atms:
            a["distance_km"] = round(haversine_km(h.lat, h.lng, a["lat"], a["lng"]), 2)
        local = sorted(atms + local, key=lambda a: a["distance_km"])
    working = [a for a in local if a.get("working", True)][:limit]
    for i, a in enumerate(working):
        a["closest"] = i == 0
        a["minutes_driving"] = max(1, round(a["distance_km"] / 40 * 60))  # ~40 km/h city driving
    down = [a for a in local if not a.get("working", True)][:3]
    return {"nearest_working": working[0] if working else None, "working": working, "out_of_service": down}


@router.post("/insurance-payout")
async def insurance_payout(household_id: str, payout_pct: float = 1.0):
    """Simulate the insurance deposit. Bridge Funds repay themselves automatically."""
    h = await load(household_id)
    if h.claim.paid:
        raise HTTPException(400, "Claim already paid")
    amount = expected_payout(h, Scenario(payout_pct=payout_pct))
    nessie = get_nessie()
    acct = h.nessie_checking_id or "mock"
    txn = await _mirror(nessie.deposit, acct, amount, "Insurance claim payout")
    note(h, "Your insurer", "Claim paid into checking", amount, txn)
    h.accounts.checking += amount
    repaid = 0.0
    if h.bridge.disbursed and not h.bridge.repaid:
        repaid = h.bridge.amount
        rtx = await _mirror(nessie.withdraw, acct, repaid, "Bridge Funds repaid automatically")
        note(h, "Your bank", "Bridge Funds repaid from the payout", -repaid, rtx)
        h.accounts.checking -= repaid
        h.bridge.repaid = True
    h.claim.paid = True
    h.disaster_mode = False
    await commit(h)
    return {"payout": amount, "bridge_repaid": repaid, "checking": round(h.accounts.checking, 2)}
