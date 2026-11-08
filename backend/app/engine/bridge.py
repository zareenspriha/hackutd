"""Bridge Funds: cash now against a documented claim, repaid automatically from the insurance payout.

Safety rules (all plain code, all shown to the family):
  1. The claim must be filed, so the insurer knows to repay the advance from the payout.
  2. Only verified proof counts: items the family confirmed, seen in a before scan, with a normal value.
     Anything the claim check flags waits for an adjuster instead of raising the limit.
  3. The limit is the lowest of: 40% of verified losses, 60 days of essential spending, half of the
     expected payout after the deductible (so it can always be repaid), and $5,000.
  4. Money moves in parts, one draw per request, each logged with a bank reference.
"""
from ..models import Household, Scenario
from .claim import has_proof
from .verify import CATEGORY_CEILING

LOSS_SHARE = 0.40
ESSENTIAL_DAYS = 60
PAYOUT_SHARE = 0.50
CAP = 5000.0


def essential_spend_60d(h: Household) -> float:
    monthly_bills = sum(b.amount for b in h.bills if b.essential)
    return round(h.weekly_essential_spend * ESSENTIAL_DAYS / 7 + monthly_bills * ESSENTIAL_DAYS / 30, 2)


def verified_losses(h: Household) -> tuple[float, list[str]]:
    """Confirmed items with a before scan and a value in the normal range, plus damage photos and receipts."""
    before = {(s.room, i.name) for s in h.scans if s.phase == "before" for i in s.items}
    total, held = 0.0, []
    for l in h.claim.losses:
        if not l.confirmed:
            continue
        flagged = ((l.room, l.name) not in before
                   or l.replacement_cost > CATEGORY_CEILING.get(l.category, 3000)
                   or (l.ai_replacement_cost and l.replacement_cost > l.ai_replacement_cost * 1.5))
        if flagged:
            held.append(l.name)
        else:
            total += l.replacement_cost
    total += sum(d.estimated_cost for d in h.claim.damage) + sum(r.countable for r in h.claim.receipts)
    return round(total, 2), held


def presets(h: Household, remaining: float) -> list[dict]:
    """Quick amounts from the family's own numbers (never a made-up price)."""
    out = []
    two_weeks = round(h.weekly_essential_spend * 2)
    if two_weeks:
        out.append({"label": "2 wks essentials", "amount": two_weeks})
    if h.displaced_nightly_cost:
        out.append({"label": "2 wks hotel", "amount": round(h.displaced_nightly_cost * 14)})
    due = sum(b.amount for b in h.bills if b.status == "pending" and b.due_in_days <= h.claim.expected_days_to_pay and b.kind != "mortgage")
    short = round(max(0.0, due - h.accounts.checking))
    if short:
        out.append({"label": "Bills due", "amount": short})
    out = [p for p in out if 0 < p["amount"] <= remaining]
    out.append({"label": "Max", "amount": round(remaining)})
    return out


def bridge_offer(h: Household) -> dict:
    """The limit is fixed by verified proof; the family can draw it in parts.
    `amount` = what's left to draw, or what was drawn once it's all used."""
    from .forecast import expected_payout  # local import: forecast -> claim -> (no cycle)

    verified, held = verified_losses(h)
    by_loss = round(verified * LOSS_SHARE, 2)
    by_spend = essential_spend_60d(h)
    by_payout = round(expected_payout(h, Scenario()) * PAYOUT_SHARE, 2)
    limit = round(max(0.0, min(by_loss, by_spend, by_payout, CAP)), 2)
    drawn = h.bridge.amount if h.bridge.disbursed else 0.0
    remaining = round(max(0.0, limit - drawn), 2) if not h.bridge.repaid else 0.0
    proof = has_proof(h)
    eligible = proof and h.claim.filed and remaining >= 1
    limiter = min((by_loss, "40% of your verified losses"), (by_spend, "60 days of essential spending"),
                  (by_payout, "half of your expected payout"), (CAP, "the $5,000 cap"))[1]
    if h.bridge.repaid:
        reason = f"${drawn:,.0f} was repaid from your insurance payout."
    elif not proof:
        reason = "Add proof first: a reviewed loss list, a damage photo, or a receipt."
    elif not h.claim.filed:
        reason = f"File your claim to unlock up to ${limit:,.0f}. Your insurer repays this from the payout, so they need the claim first."
    elif drawn and remaining >= 1:
        reason = f"${drawn:,.0f} sent so far. ${remaining:,.0f} more is available. All of it is repaid automatically when insurance pays."
    elif drawn:
        reason = f"${drawn:,.0f} sent; repaid automatically when insurance pays."
    else:
        reason = f"${limit:,.0f} available, set by {limiter}. Repaid automatically when insurance pays."
    return {
        "eligible": eligible,
        "amount": remaining if eligible else drawn,
        "limit": limit,
        "drawn": drawn,
        "remaining": remaining,
        "documented_losses": verified,
        "held_for_review": held,
        "claim_filed": h.claim.filed,
        "limits": {"forty_pct_of_losses": by_loss, "sixty_days_essentials": by_spend,
                   "half_of_payout": by_payout, "cap": CAP},
        "limited_by": limiter,
        "presets": presets(h, remaining) if eligible else [],
        "disbursed": h.bridge.disbursed,
        "repaid": h.bridge.repaid,
        "reason": reason,
        "rules": [
            "Your claim is filed, so your insurer repays this from the payout",
            "Only items you confirmed, seen in a before scan, with normal values count",
            "Never more than half of what insurance is expected to pay",
            "No interest and no fees. Every draw shows a bank reference in your activity",
        ],
    }


def available_bridge(h: Household) -> float:
    o = bridge_offer(h)
    return o["amount"] if o["eligible"] else 0.0
