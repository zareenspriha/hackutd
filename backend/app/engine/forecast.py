"""Day-by-day balance forecast until (and a week past) the claim pays. Drives runway, bills at risk and what-ifs."""
from __future__ import annotations

from ..models import Household, Scenario
from .claim import owed_breakdown

PAYCHECK_EVERY = 14
FIRST_PAYCHECK_DAY = 7
CC_MIN_PAYMENT_PCT = 0.03


def payout_day(h: Household, s: Scenario) -> int:
    return s.claim_delay_days if s.claim_delay_days is not None else h.claim.expected_days_to_pay


def expected_payout(h: Household, s: Scenario) -> float:
    gross = owed_breakdown(h)["total"] * s.payout_pct
    return round(max(0.0, gross - h.deductible), 2)


def bill_occurrences(h: Household, horizon: int, mortgage_pause: bool = False) -> list[tuple[int, str, float, str]]:
    """(day, payee, amount, kind) for each pending bill, recurring monthly."""
    mortgage_pause = mortgage_pause or h.mortgage_pause_requested
    out = []
    for b in h.bills:
        if b.status == "paid":
            first = b.due_in_days + 30
        elif b.status == "moved":
            first = b.due_in_days + 30
        else:
            first = b.due_in_days
        if b.kind == "mortgage" and mortgage_pause:
            first += 30  # one-month disaster pause
        d = first
        while d <= horizon:
            out.append((d, b.payee, b.amount, b.kind))
            d += 30
    return out


def run_forecast(h: Household, s: Scenario | None = None, extra_expense: float = 0.0, extra_label: str = "") -> dict:
    s = s or Scenario()
    pday = payout_day(h, s)
    horizon = min(max(pday + 7, 30), 120)
    paycheck = h.monthly_income * 12 / 26
    daily_essential = h.weekly_essential_spend / 7
    payout = 0.0 if h.claim.paid else expected_payout(h, s)
    repay = h.bridge.amount if h.bridge.disbursed and not h.bridge.repaid else 0.0

    bills = bill_occurrences(h, horizon, s.mortgage_pause)
    balance = h.accounts.checking + h.accounts.savings
    days = []
    runway = None
    min_before_payout, tight_day = balance, 0

    for day in range(0, horizon + 1):
        events = []
        if day == 0 and extra_expense:
            balance -= extra_expense
            events.append({"label": extra_label or "Planned expense", "amount": -extra_expense})
        if day > 0:
            balance -= daily_essential
            if h.displaced_nightly_cost and day <= pday:
                balance -= h.displaced_nightly_cost
                if day % 7 == 0:
                    events.append({"label": "Hotel this week", "amount": -round(h.displaced_nightly_cost * 7, 2)})
        if day >= FIRST_PAYCHECK_DAY and (day - FIRST_PAYCHECK_DAY) % PAYCHECK_EVERY == 0:
            window_start = day - PAYCHECK_EVERY
            missed = max(0, min(day, s.missed_work_days) - max(window_start, 0))
            pay = paycheck * (1 - missed / PAYCHECK_EVERY)
            if pay > 0:
                balance += pay
                events.append({"label": "Paycheck", "amount": round(pay, 2)})
            if missed:
                events.append({"label": f"Missed {missed} work day(s)", "amount": round(pay - paycheck, 2)})
        for (d, payee, amt, _kind) in bills:
            if d == day:
                balance -= amt
                events.append({"label": payee, "amount": -amt})
        if day == pday and payout:
            balance += payout - repay
            events.append({"label": "Insurance payout", "amount": payout})
            if repay:
                events.append({"label": "Bridge Funds repaid automatically", "amount": -repay})
        days.append({"day": day, "balance": round(balance, 2), "events": events})
        if day <= pday and balance < min_before_payout:
            min_before_payout, tight_day = balance, day
        if runway is None and balance < 0:
            runway = day

    return {
        "days": days,
        "payout_day": pday,
        "expected_payout": payout,
        "bridge_repayment": repay,
        "tight_day": tight_day,
        "min_balance_before_payout": round(min_before_payout, 2),
        "runway_days": runway,  # None = money lasts past the horizon
        "horizon": horizon,
        "assumptions": [
            f"Insurance pays on day {pday}, {int(s.payout_pct * 100)}% of what's owed, minus your ${h.deductible:,.0f} deductible",
            f"Paycheck of ${paycheck:,.0f} every 2 weeks" + (f", minus {s.missed_work_days} missed work days" if s.missed_work_days else ""),
            f"Everyday essentials about ${h.weekly_essential_spend:,.0f} a week",
            "Bills repeat monthly on their due dates",
        ] + ([f"Hotel ${h.displaced_nightly_cost:,.0f} a night until the claim pays"] if h.displaced_nightly_cost else []),
    }
