"""Recovery Coach: routes a question to the right engine, then (optionally) lets Gemini reword the answer.

Every answer returns: text, structured facts, assumptions, and one next step (top of the Next Steps list).
"""
from __future__ import annotations

import re

from ..engine.bridge import available_bridge
from ..engine.claim import claim_summary
from ..engine.forecast import run_forecast
from ..engine.health import indicators
from ..engine.ladder import can_afford, money_ladder
from ..engine.next_steps import compute_next_steps
from ..models import Household, Scenario
from .gemini import get_gemini

HOTEL_PER_NIGHT = 120.0
DEFAULT_COSTS = {  # (cost, label, essential) when the question has no dollar amount
    "car": (12000.0, "Replace the car (used, about $12,000)", False),
    "rent": (1500.0, "A month of rent", True),
    "furniture": (2000.0, "Replace furniture (about $2,000)", False),
    "laptop": (900.0, "Replace the laptop (about $900)", False),
}


def parse_afford(q: str) -> tuple[float, str, bool, list[str]]:
    ql = q.lower()
    assumptions: list[str] = []
    amount = None
    m = re.search(r"\$\s?([\d,]+(?:\.\d+)?)\s*(k)?", ql)
    if m:
        amount = float(m.group(1).replace(",", "")) * (1000 if m.group(2) else 1)
    if "hotel" in ql or "motel" in ql or "airbnb" in ql:
        nights = 7
        mm = re.search(r"(\d+|a|one|two|three|four)\s*(night|day|week)", ql)
        if mm:
            word = {"a": 1, "one": 1, "two": 2, "three": 3, "four": 4}
            n = int(mm.group(1)) if mm.group(1).isdigit() else word[mm.group(1)]
            nights = n * 7 if mm.group(2) == "week" else n
        rate = amount if amount and amount < 500 else HOTEL_PER_NIGHT
        cost = amount if amount and amount >= 500 else rate * nights
        if not amount:
            assumptions.append(f"Hotel at about ${HOTEL_PER_NIGHT:,.0f} a night")
        return cost, f"A hotel for {nights} nights", True, assumptions
    for key, (cost, label, essential) in DEFAULT_COSTS.items():
        if key in ql:
            if amount:
                return amount, label.split(" (")[0], essential, assumptions
            assumptions.append(label)
            return cost, label, essential, assumptions
    if amount:
        essential = any(w in ql for w in ("food", "grocer", "medicine", "pharmacy", "rent", "lodging"))
        return amount, f"Spend ${amount:,.0f}", essential, assumptions
    return 0.0, "", False, ["I couldn't tell the cost. Try 'Can I afford $500 for ...'"]


def detect_intent(q: str) -> str:
    ql = q.lower()
    if "afford" in ql or "can i buy" in ql or "can i pay" in ql:
        return "afford"
    if any(w in ql for w in ("what do i have", "my accounts", "how much do i have", "balance", "overview")):
        return "have"
    if any(w in ql for w in ("where do i", "which money", "use first", "ladder", "where should")):
        return "where"
    if any(w in ql for w in ("what should i do", "what do i do", "next", "first step", "help me")):
        return "next"
    if any(w in ql for w in ("claim", "owed", "insurance")):
        return "claim"
    if any(w in ql for w in ("what if", "delay", "late", "only pays", "miss work")):
        return "what_if"
    return "next"


def _accounts_view(h: Household) -> list[dict]:
    a = h.accounts
    cd_weeks = round(a.cd_matures_in_days / 7)
    return [
        {"key": "checking", "type": "Checking", "amount": a.checking, "text": f"${a.checking:,.0f} in checking"},
        {"key": "savings", "type": "Savings", "amount": a.savings, "text": f"${a.savings:,.0f} in savings"},
        {"key": "cd", "type": "CD", "amount": a.cd, "matures_in_weeks": cd_weeks,
         "text": f"${a.cd:,.0f} CD, matures in {cd_weeks} weeks"},
        {"key": "ira", "type": "IRA", "amount": a.ira, "text": f"${a.ira:,.0f} IRA (retirement)"},
        {"key": "credit_card", "type": "Credit card", "amount": a.credit_card_balance, "limit": a.credit_card_limit,
         "text": f"${a.credit_card_balance:,.0f} owed on a ${a.credit_card_limit:,.0f} card"},
        {"key": "auto_loan", "type": "Auto loan", "amount": a.auto_loan_monthly, "monthly_payment": a.auto_loan_monthly,
         "text": f"${a.auto_loan_monthly:,.0f}/month car payment"},
        {"key": "personal_loan", "type": "Personal loan", "amount": a.personal_loan_monthly,
         "monthly_payment": a.personal_loan_monthly,
         "text": f"${a.personal_loan_monthly:,.0f}/month personal loan" if a.personal_loan_monthly else "No personal loan"},
        {"key": "mortgage", "type": "Mortgage", "amount": a.mortgage_monthly, "monthly_payment": a.mortgage_monthly,
         "text": f"${a.mortgage_monthly:,.0f}/month mortgage"},
    ]


async def ask(h: Household, question: str, s: Scenario | None = None) -> dict:
    s = s or Scenario()
    fc = run_forecast(h, s)
    steps = compute_next_steps(h, s, fc, top_n=3)
    next_step = steps[0] if steps else None
    intent = detect_intent(question)
    facts: dict = {}
    assumptions = list(fc["assumptions"])

    if intent == "afford":
        cost, label, essential, extra = parse_afford(question)
        assumptions = extra + assumptions
        if cost <= 0:
            text = "How much does it cost? Try: 'Can I afford $600 for a hotel this week?'"
            facts = {}
        else:
            r = can_afford(h, cost, label, essential, s)
            facts = r
            if r["affordable"]:
                parts = [f"${p['amount']:,.0f} from {p['source'].lower()}" for p in r["funding_plan"]]
                text = (f"Yes. {label} costs about ${cost:,.0f}. Pay for it with " + ", then ".join(parts)
                        + ". Leave your CD and IRA alone.")
            else:
                text = (f"Not right now. {label} costs about ${cost:,.0f}, and you'd be ${r['shortfall']:,.0f} short "
                        "without touching your CD or IRA. Start with the steps below.")
    elif intent == "have":
        incoming = {"insurance_payout": fc["expected_payout"], "payout_day": fc["payout_day"],
                    "bridge_available": available_bridge(h),  # not yet taken (taken money is already in checking)
                    "help_circle_received": sum(t.amount for t in h.help_circle)}
        facts = {"accounts": _accounts_view(h), "incoming": incoming}
        text = (f"You have ${h.accounts.checking + h.accounts.savings:,.0f} in checking and savings, a "
                f"${h.accounts.cd:,.0f} CD and a ${h.accounts.ira:,.0f} IRA. About ${incoming['insurance_payout']:,.0f} "
                f"should come from insurance around day {incoming['payout_day']}"
                + (f", and ${incoming['bridge_available']:,.0f} in Bridge Funds is ready now." if incoming["bridge_available"] else "."))
    elif intent == "where":
        ladder = money_ladder(h, s, fc)
        facts = {"ladder": ladder}
        use = [r["name"] for r in ladder if r["action"] in ("use", "ask") and r["available"] > 0][:2]
        text = ("Use money in this order: " + ", then ".join(use or ["checking and savings"])
                + ". Keep the credit card for essentials, and protect your CD and IRA.")
    elif intent == "claim":
        c = claim_summary(h)
        facts = {k: c[k] for k in ("owed", "documented_pct", "status_line", "missing", "filed")}
        text = c["status_line"] + (f" Still missing: {c['missing'][0].lower()}." if c["missing"] else "")
    elif intent == "what_if":
        ind = indicators(h, s, fc)
        facts = {"forecast": {k: fc[k] for k in ("payout_day", "tight_day", "min_balance_before_payout", "runway_days")},
                 "indicators": ind}
        text = (f"If the claim pays on day {fc['payout_day']}, your tightest day is day {fc['tight_day']} at "
                f"${fc['min_balance_before_payout']:,.0f}. {ind['runway']['text']}")
    else:  # next
        facts = {"next_steps": steps}
        text = "Here's what to do now: " + "; ".join(s_["title"] for s_ in steps) + "." if steps else "You're on track. Nothing urgent right now."

    wording = await get_gemini().write(
        "Answer the family's question: " + question, {"draft_answer": text, "facts": facts}, fallback=text
    )
    # the one next step is added by code after Gemini, so it can never be dropped or changed
    if next_step and intent != "next":
        tail = f" Next step: {next_step['title']}."
        text += tail
        wording = wording.rstrip() + tail
    return {"intent": intent, "answer": wording, "draft": text, "facts": facts,
            "assumptions": assumptions, "next_step": next_step, "next_steps": steps}
