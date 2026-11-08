"""Recovery Priority score (0-100) for the insurer map.

Severity 40 + Financial fragility 30 (opt-in) + Silence 30.
Up, never down: fragility and silence only add points. Responders see reasons, never balances.

Silence (30) is our default definition, adjust if the team decides otherwise:
  no claim filed after the disaster: 15
  days with no contact with the insurer: 2 per day, up to 10
  outreach not answered: 5
"""
from ..models import Household
from .claim import owed_breakdown
from .health import savings_days

SEVERITY_FULL_AT = 15000.0  # documented loss that earns all 40 points


def severity_points(loss: float) -> float:
    return 40.0 * min(1.0, loss / SEVERITY_FULL_AT)


def fragility_points(h: Household) -> tuple[float, list[str]]:
    if not h.fragility_opt_in:
        return 0.0, []
    pts, reasons = 0.0, []
    days = savings_days(h)
    if days < 7:
        pts += 15
    elif days < 14:
        pts += 10
    elif days < 30:
        pts += 5
    if days < 30:
        reasons.append(f"{int(days)} days of savings")
    if h.accounts.savings < h.deductible:
        pts += 8
        reasons.append("can't cover deductible")
    util = h.accounts.credit_card_balance / h.accounts.credit_card_limit if h.accounts.credit_card_limit else 0
    if util >= 0.7:
        pts += 7
        reasons.append("high card usage")
    return min(30.0, pts), reasons


def silence_points(h: Household) -> tuple[float, list[str]]:
    pts, reasons = 0.0, []
    if h.days_since_disaster >= 1 and not h.claim.filed:
        pts += 15
        reasons.append("no claim started")
    if h.days_since_last_activity >= 1:
        pts += min(10.0, 2.0 * h.days_since_last_activity)
        if h.days_since_last_activity >= 3:
            reasons.append(f"quiet for {h.days_since_last_activity} days")
    if h.outreach_unanswered:
        pts += 5
        reasons.append("hasn't answered outreach")
    return min(30.0, pts), reasons


def score(h: Household) -> Household:
    loss = owed_breakdown(h)["total"] if h.claim.losses or h.claim.damage else h.documented_loss
    sev = severity_points(loss)
    frag, frag_r = fragility_points(h)
    sil, sil_r = silence_points(h)
    reasons = []
    if loss >= 10000:
        reasons.append("Large contents loss")
    elif loss >= 3000:
        reasons.append("Moderate loss")
    elif loss > 0:
        reasons.append("Small loss")
    # read naturally: loss, claim status, savings, then the rest
    reasons += sil_r[:1] + frag_r[:1] + sil_r[1:] + frag_r[1:]
    h.documented_loss = round(loss, 2)
    h.priority_score = round(sev + frag + sil, 1)
    h.priority_reasons = reasons
    return h


def public_view(h: Household, rank: int | None = None) -> dict:
    """What responders see on the map: no balances."""
    return {
        "id": h.id, "name": h.name, "rank": rank, "lat": h.lat, "lng": h.lng, "zip": h.zip,
        "score": h.priority_score, "reasons": h.priority_reasons,
        "summary": ", ".join(h.priority_reasons[:3]) or "No urgent signals",
        "claim_filed": h.claim.filed, "synthetic": h.synthetic,
    }
