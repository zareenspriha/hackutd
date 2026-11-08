"""Claim check: the trust layer between the family and the adjuster.

Every check is plain code over evidence already on file, so it is explainable. A check can say
"looks good" or "needs a second look"; it never rejects a claim on its own. The family sees the
same list the adjuster sees.
"""
from __future__ import annotations

from ..models import Household

# Single items above these replacement costs get a second look (typical household ceilings).
CATEGORY_CEILING = {
    "electronics": 4000, "appliance": 3500, "furniture": 5000, "clothing": 1500, "kitchen": 1500,
    "decor": 2500, "tools": 2500, "sports": 2500, "accessories": 2000, "other": 3000,
}


def _check(cid: str, label: str, ok: bool, detail: str) -> dict:
    return {"id": cid, "label": label, "status": "pass" if ok else "review", "detail": detail}


def verify_claim(h: Household) -> dict:
    c = h.claim
    checks: list[dict] = []
    before = {(s.room, i.name) for s in h.scans if s.phase == "before" for i in s.items}

    # 1. Every loss was seen before the storm (scan evidence, not just a list).
    no_proof = [l.name for l in c.losses if (l.room, l.name) not in before]
    checks.append(_check(
        "evidence", "Each item was in a before scan", not no_proof,
        "Every item has a before photo." if not no_proof else f"No before photo for {', '.join(no_proof[:3])}.",
    ))

    # 2. Values are in a normal range, and family edits stay close to the scan's estimate.
    high = [l.name for l in c.losses if l.replacement_cost > CATEGORY_CEILING.get(l.category, 3000)]
    edited = [l.name for l in c.losses if l.ai_replacement_cost and l.replacement_cost > l.ai_replacement_cost * 1.5]
    checks.append(_check(
        "values", "Values look normal", not high and not edited,
        "All values are in the usual range for each item."
        if not high and not edited
        else "A second look for " + ", ".join((high + edited)[:3]) + " (value above the usual range or raised by hand).",
    ))

    # 3. No item is claimed twice: same item in the same room, or an exact copy (name and value) in another room.
    seen, dupes = set(), []
    for l in c.losses:
        name = l.name.strip().lower()
        for k in ((l.room, name), ("*", name, round(l.replacement_cost))):
            if k in seen:
                dupes.append(l.name)
            seen.add(k)
    checks.append(_check(
        "duplicates", "Nothing is counted twice", not dupes,
        "No item or receipt appears twice." if not dupes else f"{', '.join(sorted(set(dupes))[:3])} appears in more than one room.",
    ))

    # 4. Photos and videos are clear enough to use.
    warns = [w for s in h.scans for w in s.quality_warnings]
    checks.append(_check(
        "quality", "Photos and videos are clear", not warns,
        "Every scan passed the blur and lighting check." if not warns else warns[0],
    ))

    # 5. Extra living costs only count what's above normal spending.
    over = [r.merchant for r in c.receipts if r.countable > r.total]
    checks.append(_check(
        "receipts", "Receipts count only extra costs", not over,
        f"{len(c.receipts)} receipt(s); only the part above your normal spending counts."
        if c.receipts else "No receipts yet. Hotel and food receipts add to what you're owed.",
    ))

    # 6. You reviewed every item.
    unreviewed = [l for l in c.losses if not l.confirmed]
    checks.append(_check(
        "reviewed", "You reviewed every item", not unreviewed,
        "You confirmed every item on the list." if not unreviewed else f"{len(unreviewed)} item(s) still need your review.",
    ))

    passed = sum(1 for x in checks if x["status"] == "pass")
    return {
        "passed": passed,
        "total": len(checks),
        "ready": passed == len(checks),
        "summary": "Ready for an adjuster" if passed == len(checks) else f"{len(checks) - passed} thing(s) to look at",
        "checks": checks,
    }
