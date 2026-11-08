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
        reasons.append("No savings left" if days < 1 else f"Savings last {int(days)} day{'s' if int(days) != 1 else ''}")
    if h.accounts.savings < h.deductible:
        pts += 8
        reasons.append("Can't cover the deductible")
    util = h.accounts.credit_card_balance / h.accounts.credit_card_limit if h.accounts.credit_card_limit else 0
    if util >= 0.7:
        pts += 7
        reasons.append("High card usage")
    return min(30.0, pts), reasons


def silence_points(h: Household) -> tuple[float, list[str]]:
    pts, reasons = 0.0, []
    if h.days_since_disaster >= 1 and not h.claim.filed:
        pts += 15
        reasons.append("No claim started")
    if h.days_since_last_activity >= 1:
        pts += min(10.0, 2.0 * h.days_since_last_activity)
        if h.days_since_last_activity >= 3:
            reasons.append(f"Quiet for {h.days_since_last_activity} days")
    if h.outreach_unanswered:
        pts += 5
        reasons.append("Hasn't answered outreach")
    return min(30.0, pts), reasons


NEED_LABELS = {"shelter": "Shelter", "food": "Food", "cash": "Cash", "transport": "Transport",
               "medical": "Medical care", "power": "Power or phone charging"}


def need_points(h: Household) -> tuple[float, list[str]]:
    """The family's own 'I need help' answer. Up, never down."""
    ci = h.check_in
    if not ci or (ci.safe and not ci.needs):
        return 0.0, []
    pts = (10.0 if not ci.safe else 0.0) + 4.0 * len(ci.needs)
    names = [NEED_LABELS.get(n, n.title()) for n in ci.needs]
    reason = ("Not safe" + (": needs " if names else "") if not ci.safe else "Asked for ") + ", ".join(names).lower()
    return min(20.0, pts), [reason[:1].upper() + reason[1:]]


def score(h: Household) -> Household:
    loss = owed_breakdown(h)["total"] if h.claim.losses or h.claim.damage else h.documented_loss
    sev = severity_points(loss)
    frag, frag_r = fragility_points(h)
    sil, sil_r = silence_points(h)
    need, need_r = need_points(h)
    reasons = list(need_r)
    if loss >= 10000:
        reasons.append("Large contents loss")
    elif loss >= 3000:
        reasons.append("Moderate loss")
    elif loss > 0:
        reasons.append("Small loss")
    # read naturally: loss, claim status, savings, then the rest
    reasons += sil_r[:1] + frag_r[:1] + sil_r[1:] + frag_r[1:]
    h.documented_loss = round(loss, 2)
    h.priority_score = float(min(100, round(sev + frag + sil + need)))
    h.priority_reasons = reasons
    h.priority_parts = {"severity": round(sev, 1), "fragility": round(frag, 1), "silence": round(sil, 1), "needs": round(need, 1)}
    return h


def public_view(h: Household, rank: int | None = None) -> dict:
    """What responders see on the map: no balances."""
    return {
        "id": h.id, "name": h.name, "rank": rank, "lat": h.lat, "lng": h.lng, "zip": h.zip,
        "score": h.priority_score, "reasons": h.priority_reasons,
        "severity": h.priority_parts.get("severity", 0.0), "fragility": h.priority_parts.get("fragility", 0.0),
        "silence": h.priority_parts.get("silence", 0.0),
        "summary": _summary(h.priority_reasons) or "No urgent signals",
        "needs": h.priority_parts.get("needs", 0.0),
        "claim_filed": h.claim.filed, "synthetic": h.synthetic,
        "assigned_to": h.assigned_to,
        "contacted": bool(h.outreach),
        "last_contact": h.outreach[-1].model_dump() if h.outreach else None,
        "check_in": h.check_in.model_dump() if h.check_in else None,
        "shares_hardship": h.fragility_opt_in,
    }


def _summary(reasons: list[str]) -> str:
    """'Large contents loss, no claim started, quiet for 5 days': one sentence, first word capitalized."""
    top = reasons[:3]
    return ", ".join([top[0]] + [r[:1].lower() + r[1:] for r in top[1:]]) if top else ""
