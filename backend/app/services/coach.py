"""Recovery Coach: routes a question to the right engine, then (optionally) lets Gemini reword the answer.

Every answer returns: text, structured facts, assumptions, and one next step (top of the Next Steps list).
"""
from __future__ import annotations

import re
from datetime import date, timedelta

from ..engine.bridge import available_bridge
from ..engine.claim import claim_summary
from ..engine.forecast import run_forecast
from ..engine.health import indicators
from ..engine.ladder import can_afford, money_ladder
from ..engine.next_steps import compute_next_steps
from ..models import Household, Scenario
from .gemini import get_gemini

HOTEL_PER_NIGHT = 89.0
DEFAULT_COSTS = {  # (cost, label, essential) when the question has no dollar amount
    "car": (12000.0, "Replace the car (used, about $12,000)", False),
    "rent": (1500.0, "A month of rent", True),
    "furniture": (2000.0, "Replace furniture (about $2,000)", False),
    "laptop": (900.0, "Replace the laptop (about $900)", False),
}


def parse_afford(q: str, nightly: float = HOTEL_PER_NIGHT) -> tuple[float, str, bool, list[str]]:
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
        rate = amount if amount and amount < 500 else nightly
        cost = amount if amount and amount >= 500 else rate * nights
        if not amount:
            assumptions.append(f"Hotel at your current rate, ${nightly:,.0f} a night")
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


WORDS = {"a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
         "nine": 9, "ten": 10, "twelve": 12}


def _num(tok: str) -> int | None:
    return int(tok) if tok.isdigit() else WORDS.get(tok)


def parse_scenario(q: str, base: Scenario) -> tuple[Scenario, list[str]]:
    """Pull a what-if out of plain words: 'six weeks', '2 months', 'pays 70%', 'miss two weeks of work'."""
    ql = q.lower()
    upd: dict = {}
    notes: list[str] = []
    work = re.search(r"miss(?:ed|ing)?\s+(\w+)\s+(day|week)s?\s+(?:of\s+)?work", ql)
    if work and _num(work.group(1)):
        n = _num(work.group(1)) * (7 if work.group(2) == "week" else 1)
        upd["missed_work_days"] = n
        notes.append(f"You miss {n} days of work")
    rest = ql[: work.start()] + ql[work.end():] if work else ql
    m = re.search(r"(\w+)\s+(day|week|month)s?", rest)
    if m and _num(m.group(1)) and any(w in rest for w in ("claim", "take", "late", "delay", "pay")):
        n = _num(m.group(1)) * {"day": 1, "week": 7, "month": 30}[m.group(2)]
        upd["claim_delay_days"] = n
        notes.append(f"The claim pays in {n} days")
    pct = re.search(r"(\d{2,3})\s*%", ql)
    if pct:
        upd["payout_pct"] = min(1.0, int(pct.group(1)) / 100)
        notes.append(f"Insurance pays {pct.group(1)}%")
    return base.model_copy(update=upd), notes


SCAM_WORDS = ("scam", "upfront", "up front", "gift card", "wire", "speed up", "fee to", "contractor", "called me",
              "texted me", "someone called", "someone texted", "fema called", "verify my account", "my password", "pin")


def detect_intent(q: str) -> str:
    ql = q.lower()
    if any(w in ql for w in SCAM_WORDS):
        return "scam"
    if any(w in ql for w in ("vacation", "trip", "travel", "holiday", "getaway")):
        return "vacation"
    if re.search(r"\bsell\b", ql):
        return "sell"
    if "what if" in ql or any(w in ql for w in ("takes longer", "runs late", "delay", "only pays", "miss work", "missed work")) \
            or re.search(r"(take|takes|took)\s+\w+\s+(week|month)", ql):
        return "what_if"
    if "afford" in ql or "can i buy" in ql or "can i pay for" in ql or "can i spend" in ql:
        return "afford"
    if any(w in ql for w in ("what do i have", "my accounts", "how much do i have", "how much money", "balance", "overview")):
        return "have"
    if any(w in ql for w in ("where do i", "which money", "use first", "ladder", "where should", "which account")):
        return "where"
    if any(w in ql for w in ("bill", "mortgage", "rent due", "late fee")):
        return "bills"
    if any(w in ql for w in ("claim", "owed", "insurance")):
        return "claim"
    return "next"


_MONEY = re.compile(r"\$\s?([\d,]+(?:\.\d+)?)")


def _amounts(text: str) -> set[int]:
    return {int(round(float(m.replace(",", "")))) for m in _MONEY.findall(text or "")}


def _numbers_ok(wording: str, draft: str, facts: dict) -> bool:
    """True when the AI's wording invents no dollar amounts (each is in the draft or within $1 of a fact)."""
    import json as _json

    allowed = _amounts(draft)
    nums = re.findall(r"-?\d+(?:\.\d+)?", _json.dumps(facts, default=str))
    allowed |= {int(round(abs(float(n)))) for n in nums}
    return all(any(abs(a - b) <= 1 for b in allowed) for a in _amounts(wording))


def _date(day: int) -> str:
    d = date.today() + timedelta(days=day)
    return d.strftime("%b ") + str(d.day)


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


FOLLOW_UPS = {
    "afford": ["Where should that money come from?", "What if my claim takes six weeks?"],
    "vacation": ["What if my claim takes six weeks?", "What do I have?"],
    "what_if": ["Where should I get money first?", "Which bills can wait?"],
    "have": ["Where should I get money first?", "Can I afford a hotel for two weeks?"],
    "where": ["Can I afford a hotel for two weeks?", "Which bills can wait?"],
    "bills": ["What if my claim takes six weeks?", "Where should I get money first?"],
    "claim": ["What's still missing on my claim?", "What do I have?"],
    "scam": ["What should I do next?"],
    "sell": ["What do I have?", "What if my claim takes six weeks?"],
    "next": ["What do I have?", "What if my claim takes six weeks?"],
    "step": ["What should I do after that?", "What do I have?"],
}
STEP_SCREENS = {"file_claim": "claim", "unlock_bridge": "fund", "mortgage_pause": "bills"}


def _step_detail(h: Household, st: dict, fc: dict) -> tuple[str, dict, list[dict]]:
    """How to do one next step, with our own numbers and a button to the right screen."""
    sid = st["id"]
    if sid == "file_claim":
        c = claim_summary(h)
        b = available_bridge(h) or 0
        from ..engine.bridge import bridge_offer
        lim = bridge_offer(h)["limit"]
        text = (f"Open My claim and tap File. Your claim is worth ${c['owed']['total']:,.0f}; after your "
                f"${h.deductible:,.0f} deductible, insurance should pay about ${c['estimated_payout']:,.0f}."
                + (f" Filing also unlocks up to ${lim:,.0f} in Bridge Funds." if lim >= 1 and not b else ""))
        return text, {"claim": c["owed"], "estimated_payout": c["estimated_payout"], "bridge_limit": lim}, [{"label": "Open my claim", "go": "claim"}]
    if sid == "unlock_bridge":
        from ..engine.bridge import bridge_offer
        o = bridge_offer(h)
        text = (f"Pick how much you need now, up to ${o['remaining']:,.0f}. It lands in checking in minutes and is repaid "
                f"from your insurance payout. No interest. The limit is set by {o['limited_by']}.")
        return text, {"bridge": {k: o[k] for k in ("remaining", "limit", "limits")}}, [{"label": "Open Bridge Funds", "go": "fund"}]
    if sid == "mortgage_pause":
        m = h.accounts.mortgage_monthly
        text = (f"Call your lender and ask for a disaster payment pause. It frees ${m:,.0f} this month. Ask: is it reported "
                "to credit bureaus, are late fees waived, and how are paused payments repaid?")
        return text, {"mortgage_monthly": m}, [{"label": "See my bills", "go": "bills"}]
    if sid.startswith("rescan_"):
        room = sid.removeprefix("rescan_")
        return (f"Walk the {room} slowly for 30 seconds on the same path as your home record. looma lists what changed.",
                {"room": room}, [{"label": f"Scan the {room}", "go": "scan"}])
    if sid.startswith("pay_"):
        b = next((x for x in h.bills if x.id == sid.removeprefix("pay_")), None)
        if b:
            left = h.accounts.checking - b.amount
            return (f"Pay {b.payee} ${b.amount:,.0f} from checking. You'd have ${left:,.0f} left in checking.",
                    {"bill": b.model_dump(), "checking_after": left}, [{"label": "Open bills", "go": "bills"}])
    return st["why"], {"step": st}, []


def _resolve_follow_up(question: str, history: list[dict]) -> str:
    """'What about $300?' after a trip question: carry the earlier topic forward."""
    if detect_intent(question) != "next" or not _amounts(question):
        return question
    for turn in reversed(history):
        if turn.get("role") == "user" and detect_intent(turn.get("text", "")) not in ("next", "scam"):
            prev = re.sub(r"\$\s?[\d,]+(?:\.\d+)?\s*k?", "", turn["text"])
            return f"{prev.rstrip('?. ')} {question}"
    return question


async def ask(h: Household, question: str, s: Scenario | None = None, history: list[dict] | None = None,
              step_id: str | None = None) -> dict:
    s = s or Scenario()
    history = (history or [])[-8:]
    fc = run_forecast(h, s)
    steps = compute_next_steps(h, s, fc, top_n=3)
    next_step = steps[0] if steps else None
    question = _resolve_follow_up(question, history)
    picked = next((x for x in compute_next_steps(h, s, fc, top_n=10) if x["id"] == step_id), None) if step_id else None
    intent = "step" if picked else detect_intent(question)
    actions: list[dict] = []
    facts: dict = {}
    card: dict | None = None
    assumptions = list(fc["assumptions"])

    if intent == "step":
        text, facts, actions = _step_detail(h, picked, fc)
        later = [x for x in steps if x["id"] != picked["id"]]
        next_step = later[0] if later else None
    elif intent == "afford":
        cost, label, essential, extra = parse_afford(question, h.displaced_nightly_cost or HOTEL_PER_NIGHT)
        assumptions = extra + assumptions
        if cost <= 0:
            text = "How much does it cost? Try: 'Can I afford $600 for a hotel this week?'"
        else:
            r = can_afford(h, cost, label, essential, s)
            facts = r
            rows = [{"label": p["source"] + (" (if approved)" if p["rank"] == 3 else ""), "amount": f"${p['amount']:,.0f}", "use": True}
                    for p in r["funding_plan"]]
            rows += [{"label": "CD", "amount": "protected", "use": False}, {"label": "IRA", "amount": "protected", "use": False}]
            card = {"kind": "ladder", "rows": rows}
            needs_ask = any(p["rank"] == 3 for p in r["funding_plan"])  # money that only exists if the lender says yes
            from ..engine.bridge import bridge_offer
            locked_bridge = bridge_offer(h)["limit"] if not h.claim.filed else 0
            if r["affordable"] and needs_ask:
                text = (f"Only if your lender agrees to a disaster pause. {label} costs about ${cost:,.0f}, and your checking "
                        "is already needed for bills before the claim pays."
                        + (f" Filing your claim unlocks up to ${locked_bridge:,.0f} in Bridge Funds, which would cover it."
                           if locked_bridge >= cost else "") + " Leave your CD and IRA alone.")
            elif r["affordable"]:
                parts = [f"${p['amount']:,.0f} from {p['source'].lower()}" for p in r["funding_plan"]]
                text = (f"Yes. {label} costs about ${cost:,.0f}. Pay for it with " + ", then ".join(parts)
                        + ". Leave your CD and IRA alone.")
            else:
                text = (f"Not right now. {label} costs about ${cost:,.0f}, and you'd be ${r['shortfall']:,.0f} short "
                        "without touching your CD or IRA.")
    elif intent == "vacation":
        cost, _, _, extra = parse_afford(question)
        if cost <= 0:  # never guess a price: ask
            return {"intent": "vacation", "answer": "Happy to check. About how much would the trip cost?",
                    "draft": "", "facts": {}, "card": None, "numbers_checked": True, "ai_wording_used": False,
                    "assumptions": [], "next_step": None, "next_steps": steps, "actions": [],
                    "follow_ups": ["Can I take a $300 trip?", "Can I take a $600 trip?", "Can I take a $1,000 trip?"]}
        assumptions = extra + assumptions
        # Bridge Funds are for essentials, so a trip has to fit without them.
        cushion = h.weekly_essential_spend * 2
        bridge_in_hand = h.bridge.amount if h.bridge.disbursed and not h.bridge.repaid else 0.0
        fits_now = fc["min_balance_before_payout"] - bridge_in_hand - cost > cushion
        after_day = fc["payout_day"] + 7
        bal_after = next((d["balance"] for d in fc["days"] if d["day"] == min(after_day, fc["horizon"])), 0.0)
        fits_later = bal_after - cost > cushion
        later_month = (date.today() + timedelta(days=after_day)).strftime("%B")
        facts = {"cost": cost, "affordable_now": fits_now, "balance_after_payout": bal_after, "fits_later": fits_later}
        if fits_now and fits_later:
            text = (f"Yes, if it's about ${cost:,.0f}. Pay for it after your bills this month, "
                    "and keep Bridge Funds for the hotel and food.")
            card = {"kind": "when", "now": "Fits, after this month's bills", "later": "Still fine after the payout", "date": later_month}
        elif fits_later:
            text = (f"Not this month, but you don't have to cancel it. Your claim should pay around {_date(fc['payout_day'])}. "
                    f"After that, a ${cost:,.0f} trip fits without touching your CD.")
            card = {"kind": "when", "now": "Tight until the claim pays", "later": f"A ${cost:,.0f} trip fits without touching your CD", "date": later_month}
        else:
            text = (f"Not yet. Even after the claim pays, a ${cost:,.0f} trip would leave you too little for essentials. "
                    "Let's look again once your CD matures.")
            card = {"kind": "when", "now": "Tight until the claim pays", "later": "Check again when your CD matures", "date": later_month}
    elif intent == "sell":
        ql = question.lower()
        thing = "car" if "car" in ql else "house" if ("house" in ql or "home" in ql) else "it"
        if thing == "car":
            text = (f"Hold off. Your ${h.accounts.auto_loan_monthly:,.0f} car payment is covered this month, "
                    "and you'll likely need the car to get to work. Selling it fast usually means a low price.")
        elif thing == "house":
            text = "Don't decide that this week. Your claim and Bridge Funds cover the next few weeks, so there's time to think."
        else:
            text = "No need to sell anything right now. Your Bridge Funds and the coming payout cover the next few weeks."
        facts = {"min_balance_before_payout": fc["min_balance_before_payout"], "runway_days": fc["runway_days"]}
    elif intent == "what_if":
        s2, notes = parse_scenario(question, s)
        if s2 == s:  # no numbers in the question: show a late claim
            s2 = s.model_copy(update={"claim_delay_days": fc["payout_day"] + 21})
            notes = [f"The claim pays in {s2.claim_delay_days} days"]
        f2 = run_forecast(h, s2)
        ind = indicators(h, s2, f2)
        low, when = f2["min_balance_before_payout"], _date(f2["tight_day"])
        bridge_left = available_bridge(h)
        if low < 0 and bridge_left >= -low:
            text = (f"Without help you'd run about ${-low:,.0f} short around {when}. "
                    f"Your ${bridge_left:,.0f} in Bridge Funds covers that.")
        elif low < 0:
            text = (f"You'd run about ${-low:,.0f} short around {when}. "
                    "Asking your mortgage lender for a disaster pause would cover most of that.")
        else:
            text = f"You'd still make it. Your lowest point is about ${low:,.0f} around {when}."
        facts = {"scenario": s2.model_dump(), "forecast": {k: f2[k] for k in ("payout_day", "tight_day", "min_balance_before_payout", "runway_days")},
                 "indicators": ind}
        assumptions = notes + f2["assumptions"]
        card = {"kind": "simulate"}
    elif intent == "have":
        incoming = {"insurance_payout": fc["expected_payout"], "payout_day": fc["payout_day"],
                    "bridge_available": available_bridge(h),
                    "help_circle_received": sum(t.amount for t in h.help_circle)}
        facts = {"accounts": _accounts_view(h), "incoming": incoming}
        text = (f"You have ${h.accounts.checking + h.accounts.savings:,.0f} in checking and savings, a "
                f"${h.accounts.cd:,.0f} CD and a ${h.accounts.ira:,.0f} IRA. About ${incoming['insurance_payout']:,.0f} "
                f"should come from insurance around {_date(incoming['payout_day'])}"
                + (f", and ${incoming['bridge_available']:,.0f} in Bridge Funds is ready now." if incoming["bridge_available"] else "."))
        card = {"kind": "picture"}
    elif intent == "where":
        ladder = money_ladder(h, s, fc)
        facts = {"ladder": ladder}
        use = [r["name"] for r in ladder if r["action"] in ("use", "ask") and r["available"] > 0][:2]
        text = ("Use money in this order: " + ", then ".join(use or ["checking and savings"])
                + ". Keep the credit card for essentials, and protect your CD and IRA.")
        card = {"kind": "ladder", "rows": [{"label": r["name"], "amount": f"${r['available']:,.0f}" if r["action"] != "protect" else "protected",
                                            "use": r["action"] == "use"} for r in ladder]}
    elif intent == "scam":
        facts = {"rules": ["Real responders never ask for a fee to speed up a claim",
                           "Never pay with gift cards, wire transfers or crypto",
                           "Never share your password, PIN or one-time codes",
                           "Pay contractors only after work starts, and never more than a third up front"]}
        text = ("Be careful: that has the signs of a disaster scam. No one from your insurer or bank will ask for a fee, "
                "a gift card, a wire or your PIN. Don't pay or share anything. Message your adjuster in looma to check.")
        card = {"kind": "safety", "rows": facts["rules"]}
    elif intent == "bills":
        pending = [b for b in h.bills if b.status == "pending" and b.due_in_days <= fc["payout_day"]]
        facts = {"bills": [b.model_dump() for b in pending]}
        text = (f"{len(pending)} bills are due before the claim pays. Late fees are paused while Disaster Mode is on, "
                "so pay the ones that protect your credit and move the rest.") if pending else "Nothing else is due before the claim pays."
    elif intent == "claim":
        c = claim_summary(h)
        facts = {k: c[k] for k in ("owed", "documented_pct", "status_line", "missing", "filed")}
        text = c["status_line"] + (f" Still missing: {c['missing'][0].lower()}." if c["missing"] else "")
    else:  # next
        facts = {"next_steps": steps}
        text = ("Here's what I'd do first: " + steps[0]["title"].rstrip(".") + ".") if steps else "You're on track. Nothing urgent right now."

    convo = " | ".join(f"{t.get('role')}: {str(t.get('text', ''))[:200]}" for t in history[-4:])
    wording = await get_gemini().write(
        ("Earlier in this chat: " + convo + "\n" if convo else "") + "Answer the family's question: " + question,
        {"draft_answer": text, "facts": facts}, fallback=text,
    )
    # Number guard: every dollar amount in the AI's wording must already be in our own math.
    verified = _numbers_ok(wording, text, facts)
    if not verified:
        wording = text
    # the one next step is added by code after Gemini, so it can never be dropped or changed
    if intent == "scam":
        next_step = None  # a safety answer ends with the safety step, not a to-do
    if next_step and intent not in ("next", "step"):
        tail = f" Next step: {next_step['title']}."
        text += tail
        wording = wording.rstrip() + tail
    return {"intent": intent, "answer": wording, "draft": text, "facts": facts, "card": card, "numbers_checked": True,
            "ai_wording_used": verified and wording != text,
            "assumptions": [] if intent == "scam" else assumptions, "next_step": next_step, "next_steps": steps,
            "actions": actions, "follow_ups": FOLLOW_UPS.get(intent, [])}
