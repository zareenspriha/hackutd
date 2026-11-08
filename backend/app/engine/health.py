"""The four PNC health indicators."""
from ..models import Household, Scenario
from .forecast import CC_MIN_PAYMENT_PCT, run_forecast


def _status(red: bool, yellow: bool) -> str:
    return "red" if red else "yellow" if yellow else "green"


def indicators(h: Household, s: Scenario | None = None, fc: dict | None = None) -> dict:
    s = s or Scenario()
    fc = fc or run_forecast(h, s)
    a = h.accounts

    runway = fc["runway_days"]
    runway_val = runway if runway is not None else fc["horizon"]
    runway_ind = {
        "name": "Runway",
        "value": runway_val,
        "lasts_past_horizon": runway is None,
        "status": _status(runway_val < 14, runway_val < 30),
        "text": (f"Your money lasts {runway_val} days, counting everything coming in."
                 if runway is not None else f"Your money lasts past day {fc['horizon']}, counting the insurance payout."),
    }

    cover = a.savings / h.deductible if h.deductible else 1.0
    deductible_ind = {
        "name": "Deductible coverage",
        "value": round(min(cover, 1.0) * 100),
        "status": _status(cover < 0.5, cover < 1.0),
        "text": (f"Savings cover your ${h.deductible:,.0f} deductible." if cover >= 1
                 else f"Savings cover {cover:.0%} of your ${h.deductible:,.0f} deductible."),
    }

    pday = fc["payout_day"]
    balance_by_day = {d["day"]: d["balance"] for d in fc["days"]}
    due = []
    for b in h.bills:
        if b.status == "pending" and b.due_in_days < pday:
            due.append({
                "payee": b.payee, "amount": b.amount, "due_in_days": b.due_in_days, "label": b.label,
                "at_risk": balance_by_day.get(b.due_in_days, 0) < 0,
            })
    at_risk = [d for d in due if d["at_risk"]]
    bills_ind = {
        "name": "Bills at risk",
        "value": len(due),
        "total": round(sum(d["amount"] for d in due), 2),
        "bills": due,
        "status": _status(bool(at_risk), bool(due)),
        "text": f"{len(due)} bill(s) totaling ${sum(d['amount'] for d in due):,.0f} are due before the claim pays"
                + (f"; {len(at_risk)} can't be covered right now." if at_risk else "."),
    }

    cc_min = a.credit_card_balance * CC_MIN_PAYMENT_PCT
    debt_monthly = a.mortgage_monthly + a.auto_loan_monthly + a.personal_loan_monthly + cc_min
    dti = debt_monthly / h.monthly_income if h.monthly_income else 1.0
    util = a.credit_card_balance / a.credit_card_limit if a.credit_card_limit else 0.0
    debt_ind = {
        "name": "Debt pressure",
        "value": round(dti * 100),
        "credit_utilization": round(util * 100),
        "status": _status(dti > 0.43 or util > 0.8, dti > 0.36 or util > 0.5),
        "text": f"{dti:.0%} of income goes to debt payments; your card is {util:.0%} used.",
    }
    return {"runway": runway_ind, "deductible": deductible_ind, "bills_at_risk": bills_ind, "debt_pressure": debt_ind}


def savings_days(h: Household) -> float:
    """Quick version for 2,000 households: days the savings account covers today's outflows
    (essentials + bills + extra disaster spending like eating out or hotels)."""
    weeks = max(h.days_since_disaster, 1) / 7
    extra = max(0.0, h.post_disaster_spend.get("food", 0) - h.weekly_grocery_spend * weeks) + h.post_disaster_spend.get("lodging", 0)
    daily = h.weekly_essential_spend / 7 + sum(b.amount for b in h.bills) / 30 + extra / max(h.days_since_disaster, 1)
    return h.accounts.savings / daily if daily else 999.0
