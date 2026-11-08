"""Replacement cost and actual cash value. Gemini gives a value range; all money math is here."""
from ..models import Item

# Yearly depreciation by category (straight line), with a floor so nothing goes to $0.
DEPRECIATION_PER_YEAR = {
    "electronics": 0.20,
    "appliance": 0.10,
    "furniture": 0.10,
    "clothing": 0.25,
    "kitchen": 0.10,
    "decor": 0.05,
    "tools": 0.08,
    "sports": 0.12,
    "accessories": 0.15,
    "other": 0.10,
}
ACV_FLOOR = 0.10


def normalize_category(category: str) -> str:
    c = category.lower().strip()
    aliases = {
        "appliances": "appliance", "small appliance": "appliance", "electronic": "electronics",
        "computer": "electronics", "lighting": "decor", "bag": "accessories", "bags": "accessories",
    }
    c = aliases.get(c, c)
    return c if c in DEPRECIATION_PER_YEAR else "other"


def replacement_cost(item: Item) -> float:
    """Cost to buy new today: midpoint of Gemini's range."""
    return round((item.value_low + item.value_high) / 2, 2)


def actual_cash_value(rc: float, category: str, age_years: float) -> float:
    rate = DEPRECIATION_PER_YEAR[normalize_category(category)]
    return round(rc * max(ACV_FLOOR, 1 - rate * age_years), 2)


def value_item(item: Item) -> Item:
    item.category = normalize_category(item.category)
    item.replacement_cost = replacement_cost(item)
    item.actual_cash_value = actual_cash_value(item.replacement_cost, item.category, item.age_years)
    return item
