"""Recovery Card: Bridge Funds on a virtual card that only works at essentials.

Every approved purchase becomes claim proof automatically (no receipt to snap), counted with the same
extra-living-expense rule as a photographed receipt: only the part above the family's normal spending.
"""
from __future__ import annotations

from ..models import Household, Receipt
from .claim import apply_ale_rule

# kind -> (essential, claim category or None, label)
KINDS = {
    "lodging": (True, "lodging", "Hotel"),
    "groceries": (True, "food", "Groceries"),
    "restaurant": (True, "food", "Meals"),
    "pharmacy": (True, None, "Pharmacy"),
    "gas": (True, None, "Gas"),
    "transport": (True, "transport", "Rental car or rides"),
    "electronics": (False, None, "Electronics"),
    "entertainment": (False, None, "Entertainment"),
    "cash": (False, None, "Cash withdrawal"),
}
CARD_RECEIPT = "Recovery Card · "


def demo_terminal(h: Household) -> list[dict]:
    """Places near the family to try the card (generic names, prices from their own numbers)."""
    hotel = h.displaced_nightly_cost or 89.0
    return [
        {"id": "hotel", "merchant": "Hotel on Preston Rd", "kind": "lodging", "amount": hotel, "what": "1 night"},
        {"id": "grocer", "merchant": "Grocery store", "kind": "groceries", "amount": 64.20, "what": "Groceries"},
        {"id": "taqueria", "merchant": "Taquería on Jefferson Blvd", "kind": "restaurant", "amount": 52.00, "what": "Dinner for four"},
        {"id": "pharmacy", "merchant": "Pharmacy", "kind": "pharmacy", "amount": 23.50, "what": "Prescriptions"},
        {"id": "gas", "merchant": "Gas station", "kind": "gas", "amount": 41.00, "what": "Fill up"},
        {"id": "tv", "merchant": "Electronics store", "kind": "electronics", "amount": 499.00, "what": "65-inch TV"},
    ]


def card_limit(h: Household) -> float:
    """The card spends the Bridge Funds the family has drawn (that money sits in checking, earmarked)."""
    return round(h.bridge.amount, 2) if h.bridge.disbursed and not h.bridge.repaid else 0.0


def card_spent(h: Household) -> float:
    return round(sum(p.amount for p in h.card.purchases if p.approved), 2)


def card_available(h: Household) -> float:
    return round(max(0.0, min(card_limit(h) - card_spent(h), h.accounts.checking)), 2)


def food_this_period(h: Household) -> tuple[float, float, int]:
    """(card food spend, normal grocery spend for the same days, days) since the disaster, at least a week."""
    days = max(7, h.days_since_disaster)
    spent = sum(p.amount for p in h.card.purchases if p.approved and KINDS.get(p.kind, (0, None))[1] == "food")
    return round(spent, 2), round(h.weekly_grocery_spend * days / 7, 2), days


def authorize(h: Household, merchant: str, kind: str, amount: float) -> tuple[bool, str]:
    essential = KINDS.get(kind, (False, None, kind))[0]
    if not h.card.active:
        return False, "Turn on your Recovery Card first."
    if not essential:
        return False, f"Declined: {KINDS.get(kind, (0, 0, kind))[2].lower()} isn't an essential. This card is for getting through the disaster."
    if amount > card_available(h):
        return False, f"Declined: only ${card_available(h):,.0f} left on the card. Ask looma where else to find the money."
    return True, ""


def record_claim_proof(h: Household, kind: str, merchant: str, amount: float) -> tuple[float, str]:
    """Turn an approved purchase into claim proof. Returns (amount the claim went up by, plain explanation)."""
    cat = KINDS[kind][1]
    if cat is None:
        return 0.0, "Essential, but part of normal spending, so it isn't added to your claim."
    before = sum(r.countable for r in h.claim.receipts)
    if cat == "food":
        # one running food receipt for the card: only food above the normal grocery budget counts
        spent, normal, days = food_this_period(h)
        h.claim.receipts = [r for r in h.claim.receipts if r.merchant != CARD_RECEIPT + "food"]
        r = apply_ale_rule(h, Receipt(merchant=CARD_RECEIPT + "food", category="food", total=spent, days_covered=days))
        h.claim.receipts.append(r)
        added = round(sum(x.countable for x in h.claim.receipts) - before, 2)
        if added > 0:
            return added, f"+${added:,.0f} to your claim: food above your normal ${h.weekly_grocery_spend:,.0f} a week counts."
        return 0.0, f"Food so far: ${spent:,.0f} of your normal ${normal:,.0f} for {days} days. Anything above that is added to your claim."
    r = apply_ale_rule(h, Receipt(merchant=CARD_RECEIPT + merchant, category=cat, total=amount, days_covered=1))
    h.claim.receipts.append(r)
    return r.countable, f"+${r.countable:,.0f} to your claim: a cost you wouldn't have without the disaster."


def card_view(h: Household) -> dict:
    spent, normal, days = food_this_period(h)
    return {
        "active": h.card.active,
        "last4": h.card.last4,
        "limit": card_limit(h),
        "spent": card_spent(h),
        "available": card_available(h),
        "added_to_claim": round(sum(p.added_to_claim for p in h.card.purchases), 2),
        "food": {"spent": spent, "normal": normal, "days": days},
        "purchases": [p.model_dump() for p in reversed(h.card.purchases)][:20],
        "terminal": demo_terminal(h),
        "rules": [
            "Works at hotels, groceries, restaurants, pharmacies, gas and rides",
            "Declines anything that isn't essential",
            "Every purchase is added to your claim automatically, counting only what's above normal spending",
            "Spends your Bridge Funds, repaid when insurance pays. No interest",
        ],
    }
