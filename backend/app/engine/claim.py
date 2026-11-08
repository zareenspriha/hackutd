"""Claim Tracker: what the family is owed, how much is documented, what's still missing."""
from ..models import Household, Receipt

# Normal weekly spending per receipt category. Food comes from the family's grocery baseline (Nessie);
# lodging/transport baseline is 0 because their housing and car are already paid through normal bills.


def apply_ale_rule(h: Household, r: Receipt) -> Receipt:
    """Extra living expenses: only the part above normal spending counts."""
    weeks = max(r.days_covered, 1) / 7
    if r.category == "food":
        normal = h.weekly_grocery_spend * weeks
        r.countable = round(max(0.0, r.total - normal), 2)
        r.explanation = (
            f"Only ${r.countable:,.0f} counts, since you normally spend "
            f"${h.weekly_grocery_spend:,.0f} a week on groceries."
        )
    elif r.category in ("lodging", "transport"):
        r.countable = round(r.total, 2)
        r.explanation = f"All ${r.total:,.0f} counts: this is a cost you wouldn't have without the disaster."
    else:
        r.countable = 0.0
        r.explanation = "This doesn't look like an extra living expense, so it isn't added."
    return r


def owed_breakdown(h: Household) -> dict:
    belongings = sum(l.replacement_cost for l in h.claim.losses)
    belongings_acv = sum(l.actual_cash_value for l in h.claim.losses)
    damage = sum(d.estimated_cost for d in h.claim.damage)
    ale = sum(r.countable for r in h.claim.receipts)
    return {
        "belongings": round(belongings, 2),
        "belongings_actual_cash_value": round(belongings_acv, 2),
        "home_damage": round(damage, 2),
        "extra_living_expenses": round(ale, 2),
        "total": round(belongings + damage + ale, 2),
    }


def documented_total(h: Household) -> float:
    """Value with proof the family has confirmed (reviewed losses, damage photos, receipts)."""
    belongings = sum(l.replacement_cost for l in h.claim.losses if l.confirmed)
    damage = sum(d.estimated_cost for d in h.claim.damage)
    ale = sum(r.countable for r in h.claim.receipts)
    return round(belongings + damage + ale, 2)


def missing_pieces(h: Household) -> list[str]:
    out: list[str] = []
    before_rooms = {s.room for s in h.scans if s.phase == "before"}
    after_rooms = {s.room for s in h.scans if s.phase == "after"}
    for room in sorted(before_rooms - after_rooms):
        out.append(f"Record the {room} again after the disaster")
    unconfirmed = [l for l in h.claim.losses if not l.confirmed]
    if unconfirmed:
        out.append(f"Review {len(unconfirmed)} item(s) on your loss list")
    for s in h.scans:
        for area in s.missing_areas:
            out.append(f"{s.room}: {area}")
    if h.disaster_mode and not h.claim.receipts:
        out.append("Snap receipts for hotels, meals and travel since the disaster")
    if not h.claim.filed:
        out.append("File your insurance claim")
    return out


def claim_summary(h: Household) -> dict:
    owed = owed_breakdown(h)
    documented = documented_total(h)
    pct = round(100 * documented / owed["total"]) if owed["total"] else 0
    return {
        "owed": owed,
        "documented": documented,
        "documented_pct": pct,
        "status_line": f"Owed to you: ${owed['total']:,.0f}. Documented: {pct}%.",
        "missing": missing_pieces(h),
        "filed": h.claim.filed,
        "expected_days_to_pay": h.claim.expected_days_to_pay,
        "losses": [l.model_dump() for l in h.claim.losses],
        "damage": [d.model_dump() for d in h.claim.damage],
        "receipts": [r.model_dump() for r in h.claim.receipts],
    }


def has_proof(h: Household) -> bool:
    """Bridge Funds need at least one piece of documented proof."""
    framed = any(l.before_frame_ts is not None and l.confirmed for l in h.claim.losses)
    return framed or bool(h.claim.damage) or bool(h.claim.receipts) or any(l.confirmed for l in h.claim.losses)
