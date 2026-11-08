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
    documented = documented_total(h)
    by_loss = round(documented * LOSS_SHARE, 2)
    by_spend = essential_spend_60d(h)
    amount = round(min(by_loss, by_spend, CAP), 2)
    eligible = has_proof(h) and amount > 0 and not h.bridge.disbursed
    limiter = min((by_loss, "40% of documented losses"), (by_spend, "60 days of essential spending"), (CAP, "the $5,000 cap"))[1]
    if h.bridge.disbursed:
        reason = f"${h.bridge.amount:,.0f} already sent" + (" and repaid." if h.bridge.repaid else "; repaid automatically when insurance pays.")
    elif not has_proof(h):
        reason = "Add proof first: a reviewed loss list, a damage photo, or a receipt."
    else:
        reason = f"${amount:,.0f} available, set by {limiter}. Repaid automatically when insurance pays."
    return {
        "eligible": eligible,
        "amount": amount if not h.bridge.disbursed else h.bridge.amount,
        "documented_losses": documented,
        "limits": {"forty_pct_of_losses": by_loss, "sixty_days_essentials": by_spend, "cap": CAP},
        "disbursed": h.bridge.disbursed,
        "repaid": h.bridge.repaid,
        "reason": reason,
    }


def available_bridge(h: Household) -> float:
    o = bridge_offer(h)
    return o["amount"] if o["eligible"] else 0.0
