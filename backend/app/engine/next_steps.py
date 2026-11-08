"""Next Steps card: the 3 most important actions right now. Rules are code; Gemini may only reword `why`."""
from __future__ import annotations

from ..models import Household, Scenario
from .bridge import available_bridge
from .forecast import run_forecast

TOP_N = 3


def _step(id_: str, priority: int, title: str, why: str, action: str) -> dict:
    return {"id": id_, "priority": priority, "title": title, "why": why, "action": action, "done": False}


def compute_next_steps(h: Household, s: Scenario | None = None, fc: dict | None = None, top_n: int = TOP_N) -> list[dict]:
    s = s or Scenario()
    fc = fc or run_forecast(h, s)
    steps: list[dict] = []
    a = h.accounts

    # 1. claim not filed
    if h.disaster_mode and not h.claim.filed:
        steps.append(_step("file_claim", 1, "File your claim with State Farm today",
                           "Every day you wait pushes back your payout.", "/claim/file"))

    # 2. rooms scanned before but not after
    if h.disaster_mode:
        before = {x.room for x in h.scans if x.phase == "before"}
        after = {x.room for x in h.scans if x.phase == "after"}
        for room in sorted(before - after):
            steps.append(_step(f"rescan_{room}", 2, f"Record the {room} again",
                               "It's still missing from your claim.", f"/scan?room={room}"))

    # 3. Bridge Funds ready
    bridge = available_bridge(h)
    if bridge > 0:
        steps.append(_step("unlock_bridge", 3, f"Unlock ${bridge:,.0f} in Bridge Funds",
                           "Repaid automatically when insurance pays. No interest, no payday loan.", "/bridge"))

    # 4. bills to pay now / 5. mortgage pause
    pday = fc["payout_day"]
    mortgage_hits = sum(1 for d in fc["days"] for e in d["events"] if e["label"] == "Mortgage" and d["day"] <= pday)
    short = fc["min_balance_before_payout"] < 0
    for b in sorted(h.bills, key=lambda b: b.due_in_days):
        if b.status != "pending" or b.due_in_days >= pday:
            continue
        if b.kind == "mortgage":
            if not h.mortgage_pause_requested:
                urgent = short or mortgage_hits >= 2
                why = (f"{mortgage_hits} mortgage payments now fall before the claim pays. A pause saves ${b.amount:,.0f} a month."
                       if mortgage_hits >= 2 else f"Saves ${b.amount:,.0f} this month while you wait on the claim.")
                st = _step("mortgage_pause", 2 if urgent else 4, "Call your lender about a disaster payment pause",
                           why, "/coach/call-script/mortgage")
                st["_due"], st["_amt"] = b.due_in_days, b.amount
                steps.append(st)
        elif b.label == "pay_now" or (b.essential and b.label is None and h.disaster_mode):
            when = "today" if b.due_in_days == 0 else "tomorrow" if b.due_in_days == 1 else f"in {b.due_in_days} days"
            st = _step(f"pay_{b.id}", 4, f"Pay your {b.payee.lower()} (${b.amount:,.0f}) {when}",
                       "Keeps it current. Late fees are paused while Disaster Mode is on.", f"/bills/{b.id}")
            st["_due"], st["_amt"] = b.due_in_days, b.amount
            steps.append(st)
        elif b.label == "call_about":
            st = _step(f"call_{b.id}", 4, f"Call {b.payee} about your ${b.amount:,.0f} bill",
                       "Ask to move the due date until the claim pays.", f"/bills/{b.id}")
            st["_due"], st["_amt"] = b.due_in_days, b.amount
            steps.append(st)

    # 6. runway under 14 days
    runway = fc["runway_days"]
    if runway is not None and runway < 14:
        gap = -min(d["balance"] for d in fc["days"])
        steps.append(_step("help_circle", 6, f"Ask your Help Circle for ${gap:,.0f}",
                           f"Your money runs out on day {runway}, before the claim pays.", "/help-circle"))

    # 7. spending above baseline with no receipts
    if h.disaster_mode:
        weeks = max(h.days_since_disaster, 1) / 7
        food_extra = h.post_disaster_spend.get("food", 0) - h.weekly_grocery_spend * weeks
        lodging = h.post_disaster_spend.get("lodging", 0)
        receipt_cats = {r.category for r in h.claim.receipts}
        if lodging > 0 and "lodging" not in receipt_cats:
            steps.append(_step("receipts_lodging", 7, "Snap your hotel receipts",
                               f"About ${lodging:,.0f} of it counts toward your claim.", "/receipts"))
        if food_extra > 0 and "food" not in receipt_cats:
            steps.append(_step("receipts_food", 7, "Snap your restaurant receipts",
                               f"About ${food_extra:,.0f} above your normal grocery spending counts toward your claim.", "/receipts"))

    # 8. deductible not covered
    if a.savings < h.deductible:
        steps.append(_step("deductible", 8, f"Keep ${a.savings:,.0f} in savings for your deductible",
                           f"Your deductible is ${h.deductible:,.0f}. Skip can-wait purchases until the claim pays.", "/coach"))

    # 9. documentation not complete
    unconfirmed = [l for l in h.claim.losses if not l.confirmed]
    if unconfirmed:
        steps.append(_step("review_losses", 9, f"Review {len(unconfirmed)} item(s) on your loss list",
                           "Confirmed items count toward Bridge Funds and your claim.", "/claim/review"))

    # 10. forecast dips: guard the CD
    if fc["min_balance_before_payout"] < 0 and a.cd > 0:
        steps.append(_step("protect_cd", 10, "Don't break your CD",
                           f"It matures in {round(a.cd_matures_in_days / 7)} weeks. Use the Money Ladder instead.", "/ladder"))

    # Same priority: bills due this week first, then the biggest amount at stake.
    steps.sort(key=lambda x: (x["priority"], 0 if x.get("_due", 0) <= 7 else 1, -x.get("_amt", 0)))
    for st in steps:
        st.pop("_due", None)
        st.pop("_amt", None)
    return steps[:top_n]
