"""Bridge Funds: cash now against a documented claim, repaid automatically from the insurance payout."""
from ..models import Household
from .claim import documented_total, has_proof

LOSS_SHARE = 0.40
ESSENTIAL_DAYS = 60
CAP = 5000.0


def essential_spend_60d(h: Household) -> float:
    monthly_bills = sum(b.amount for b in h.bills if b.essential)
    return round(h.weekly_essential_spend * ESSENTIAL_DAYS / 7 + monthly_bills * ESSENTIAL_DAYS / 30, 2)


def bridge_offer(h: Household) -> dict:
    """The limit is fixed by proof; the family can draw it in parts. `amount` = what's left to draw, or what was drawn once it's all used."""
    documented = documented_total(h)
    by_loss = round(documented * LOSS_SHARE, 2)
    by_spend = essential_spend_60d(h)
    limit = round(min(by_loss, by_spend, CAP), 2)
    drawn = h.bridge.amount if h.bridge.disbursed else 0.0
    remaining = round(max(0.0, limit - drawn), 2) if not h.bridge.repaid else 0.0
    eligible = has_proof(h) and remaining >= 1
    limiter = min((by_loss, "40% of documented losses"), (by_spend, "60 days of essential spending"), (CAP, "the $5,000 cap"))[1]
    if h.bridge.repaid:
        reason = f"${drawn:,.0f} was repaid from your insurance payout."
    elif not has_proof(h):
        reason = "Add proof first: a reviewed loss list, a damage photo, or a receipt."
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
        "documented_losses": documented,
        "limits": {"forty_pct_of_losses": by_loss, "sixty_days_essentials": by_spend, "cap": CAP},
        "disbursed": h.bridge.disbursed,
        "repaid": h.bridge.repaid,
        "reason": reason,
    }


def available_bridge(h: Household) -> float:
    o = bridge_offer(h)
    return o["amount"] if o["eligible"] else 0.0
