"""Pillar 2 (Capital One): Bridge Funds, Disaster Mode, Help Circle, Cash Access, insurance payout. Uses Nessie."""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..data.synthetic import garcia_purchases
from ..engine.bridge import bridge_offer
from ..engine.disaster import bill_view, label_spending, set_disaster_mode
from ..engine.forecast import expected_payout
from ..models import HelpTransfer, Scenario
from ..services.nessie import get_nessie
from ..store import get_store
from .deps import commit, load

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


@router.post("/bridge/disburse")
async def disburse_bridge(household_id: str):
    h = await load(household_id)
    offer = bridge_offer(h)
    if not offer["eligible"]:
        raise HTTPException(400, offer["reason"])
    nessie = get_nessie()
    txn = await _mirror(nessie.deposit, h.nessie_checking_id or "mock", offer["amount"], "Looma Bridge Funds advance")
    h.accounts.checking += offer["amount"]
    h.bridge.amount = offer["amount"]
    h.bridge.disbursed = True
    await commit(h)
    return {**bridge_offer(h), "checking": h.accounts.checking, "nessie_transaction_id": txn}


class DisasterToggle(BaseModel):
    on: bool = True


@router.post("/disaster-mode")
async def disaster_mode(household_id: str, body: DisasterToggle):
    h = set_disaster_mode(await load(household_id), body.on)
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
    if body.action == "pay":
        if h.accounts.checking < b.amount:
            raise HTTPException(400, "Not enough in checking. Ask the coach where to find the money.")
        await _mirror(get_nessie().withdraw, h.nessie_checking_id or "mock", b.amount, f"Paid {b.payee}")
        h.accounts.checking -= b.amount
        b.status = "paid"
    else:
        b.status = "moved"
    await commit(h)
    return {"bills": bill_view(h), "checking": h.accounts.checking}


@router.post("/mortgage-pause")
async def request_mortgage_pause(household_id: str):
    """Records that the family asked the lender for a disaster pause (simulated as approved for one month)."""
    h = await load(household_id)
    h.mortgage_pause_requested = True
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
    from_name: str
    amount: float = Field(gt=0, le=10000)
    note: str = ""


@router.post("/help-circle")
async def help_circle(household_id: str, body: HelpIn):
    """A relative sends money (Nessie P2P transfer)."""
    h = await load(household_id)
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
    h.accounts.checking += body.amount
    await commit(h)
    return {"received": body.amount, "from": body.from_name, "checking": h.accounts.checking,
            "help_circle_total": sum(t.amount for t in h.help_circle), "nessie_transaction_id": txn}


@router.get("/cash-access")
async def cash_access(household_id: str, km: float = 15, limit: int = 5):
    """Nearest working ATMs (Nessie ATMs when connected, plus simulated outages in the flood zone)."""
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
    await _mirror(nessie.deposit, acct, amount, "Insurance claim payout")
    h.accounts.checking += amount
    repaid = 0.0
    if h.bridge.disbursed and not h.bridge.repaid:
        repaid = h.bridge.amount
        await _mirror(nessie.withdraw, acct, repaid, "Bridge Funds repaid automatically")
        h.accounts.checking -= repaid
        h.bridge.repaid = True
    h.claim.paid = True
    h.disaster_mode = False
    await commit(h)
    return {"payout": amount, "bridge_repaid": repaid, "checking": round(h.accounts.checking, 2)}
