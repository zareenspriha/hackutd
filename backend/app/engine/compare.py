"""Before vs. after: match items by room, category and name; anything missing or damaged goes on the loss list."""
from difflib import SequenceMatcher

from ..models import Item, LossItem

DAMAGED_SHARE = 0.6  # a damaged (repairable) item counts 60%; missing/destroyed count 100%
NAME_MATCH = 0.6


def _norm(s: str) -> str:
    return " ".join(s.lower().replace("-", " ").split())


def _similar(a: str, b: str) -> float:
    a, b = _norm(a), _norm(b)
    if a in b or b in a:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def compare_items(before: list[Item], after: list[Item]) -> list[LossItem]:
    remaining = list(after)
    losses: list[LossItem] = []
    for b in before:
        best, best_score = None, 0.0
        for a in remaining:
            if a.room.lower() != b.room.lower():
                continue
            score = _similar(a.name, b.name) + (0.2 if a.category == b.category else 0)
            if score > best_score:
                best, best_score = a, score
        if best is None or best_score < NAME_MATCH:
            losses.append(_loss(b, "missing", None))
            continue
        remaining.remove(best)
        if best.condition in ("damaged", "destroyed"):
            losses.append(_loss(b, best.condition, best.frame_ts))
    return losses


def _loss(b: Item, status: str, after_ts: float | None) -> LossItem:
    share = DAMAGED_SHARE if status == "damaged" else 1.0
    return LossItem(
        name=b.name,
        category=b.category,
        room=b.room,
        status=status,
        replacement_cost=round(b.replacement_cost * share, 2),
        actual_cash_value=round(b.actual_cash_value * share, 2),
        before_frame_ts=b.frame_ts,
        after_frame_ts=after_ts,
    )
