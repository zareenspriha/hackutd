"""Disaster Mode: label every bill due before the claim pays, pause late fees, label spending."""
from ..models import Household, Scenario
from .forecast import payout_day

ESSENTIAL_SPEND = {"groceries", "food", "restaurant", "lodging", "hotel", "pharmacy", "medicine", "gas", "utilities"}


def label_bills(h: Household, s: Scenario | None = None) -> Household:
    pday = payout_day(h, s or Scenario())
    for b in h.bills:
        if b.status != "pending" or b.due_in_days >= pday:
            b.label = None
            continue
        if b.kind == "mortgage":
            b.label = "call_about"  # lenders often offer disaster forbearance
        elif not b.essential:
            b.label = "move"
        else:
            b.label = "pay_now"
        if h.disaster_mode:
            b.late_fee_paused = True
    return h


def set_disaster_mode(h: Household, on: bool) -> Household:
    h.disaster_mode = on
    if not on:
        for b in h.bills:
            b.label = None
            b.late_fee_paused = False
        return h
    return label_bills(h)


def label_spending(purchases: list[dict]) -> list[dict]:
    out = []
    for p in purchases:
        cat = (p.get("category") or "").lower()
        out.append({**p, "essential": cat in ESSENTIAL_SPEND, "label": "essential" if cat in ESSENTIAL_SPEND else "can wait"})
    return out


def bill_view(h: Household) -> list[dict]:
    text = {"pay_now": "Pay now", "move": "Move to after the claim pays", "call_about": "Call about a disaster pause"}
    return [
        {**b.model_dump(), "label_text": text.get(b.label or "", "Due after the claim pays")}
        for b in sorted(h.bills, key=lambda b: b.due_in_days)
    ]
