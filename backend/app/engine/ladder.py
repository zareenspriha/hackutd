"""Money Ladder (the order money gets used) and the 'Can I afford this?' answer."""
from ..models import Household, Scenario
from .bridge import available_bridge
from .forecast import run_forecast


def money_ladder(h: Household, s: Scenario | None = None, fc: dict | None = None) -> list[dict]:
    s = s or Scenario()
    fc = fc or run_forecast(h, s)
    a = h.accounts
    bridge_avail = available_bridge(h)
    help_total = sum(t.amount for t in h.help_circle)
    free_cash = max(0.0, fc["min_balance_before_payout"])
    # Bridge Funds already deposited + Help Circle money sit in checking; count them as rung 1, not rung 2.
    in_checking = (h.bridge.amount if h.bridge.disbursed and not h.bridge.repaid else 0.0) + help_total
    earmarked = min(free_cash, in_checking)
    free_cash -= earmarked
    bridge_avail += earmarked
    mortgage_due_before = any(
        b.kind == "mortgage" and b.status == "pending" and b.due_in_days < fc["payout_day"] for b in h.bills
    )
    cd_weeks = round(a.cd_matures_in_days / 7)
    return [
        {"rank": 1, "key": "bridge_help", "name": "Bridge Funds and Help Circle money", "action": "use",
         "available": round(bridge_avail, 2),
         "text": (f"${bridge_avail:,.0f} from Bridge Funds and your Help Circle is ready to use." if bridge_avail
                  else "Bridge Funds unlock once you add proof.")},
        {"rank": 2, "key": "checking_savings", "name": "Checking and savings", "action": "use",
         "available": round(free_cash, 2),
         "text": f"${free_cash:,.0f} is free after the bills and essentials due before the claim pays."},
        {"rank": 3, "key": "mortgage_pause", "name": "Ask the mortgage lender about a disaster payment pause", "action": "ask",
         "available": a.mortgage_monthly if (mortgage_due_before and not h.mortgage_pause_requested) else 0.0,
         "text": (f"A pause frees ${a.mortgage_monthly:,.0f} this month." if mortgage_due_before and not h.mortgage_pause_requested
                  else "Pause requested." if h.mortgage_pause_requested else "No mortgage payment due before the claim pays.")},
        {"rank": 4, "key": "credit_card", "name": "Credit card, only for essentials", "action": "essentials_only",
         "available": round(max(0.0, a.credit_card_limit - a.credit_card_balance), 2),
         "text": f"${a.credit_card_limit - a.credit_card_balance:,.0f} left on the card. Use it only for food, lodging or medicine."},
        {"rank": 5, "key": "cd", "name": "Protect the CD until it matures", "action": "protect", "available": 0.0,
         "text": f"Your ${a.cd:,.0f} CD matures in {cd_weeks} weeks. Breaking it early costs interest."},
        {"rank": 6, "key": "ira", "name": "Protect the IRA", "action": "protect", "available": 0.0,
         "text": f"Your ${a.ira:,.0f} IRA: early withdrawal costs a 10% penalty plus taxes."},
    ]


def can_afford(h: Household, cost: float, label: str, essential: bool, s: Scenario | None = None) -> dict:
    s = s or Scenario()
    fc = run_forecast(h, s)
    ladder = money_ladder(h, s, fc)
    remaining = cost
    plan = []
    for rung in ladder:
        if remaining <= 0:
            break
        if rung["action"] == "protect":
            continue
        if rung["key"] == "credit_card" and not essential:
            continue
        take = min(rung["available"], remaining)
        if take > 0:
            plan.append({"rank": rung["rank"], "source": rung["name"], "amount": round(take, 2)})
            remaining -= take
    affordable = remaining <= 0.005
    after = run_forecast(h, s, extra_expense=cost, extra_label=label)
    return {
        "question": label,
        "cost": round(cost, 2),
        "affordable": affordable,
        "shortfall": round(max(0.0, remaining), 2),
        "funding_plan": plan,
        "protect": ["CD", "IRA"],
        "forecast_after": {"runway_days": after["runway_days"], "tight_day": after["tight_day"],
                           "min_balance_before_payout": after["min_balance_before_payout"]},
        "assumptions": fc["assumptions"],
    }
