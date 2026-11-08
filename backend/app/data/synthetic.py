"""Synthetic data: the Garcias (demo family), their better-off neighbor, 2,000 Dallas County households, and ATMs."""
from __future__ import annotations

import random
from datetime import date, timedelta

from ..engine.disaster import label_bills
from ..engine.priority import score
from ..engine.valuation import value_item
from ..models import Accounts, Bill, CircleMember, Claim, Household, Item, LossItem, RoomScan

GARCIA_ID = "garcia"
NEIGHBOR_ID = "nguyen"
DALLAS = (32.7767, -96.7970)
GARCIA_LOC = (32.7357, -96.8648)  # Oak Cliff
DALLAS_ZIPS = ["75208", "75211", "75212", "75216", "75224", "75232", "75233", "75203", "75215", "75217",
               "75227", "75228", "75241", "75236", "75237", "75249", "75253", "75180", "75149", "75150"]


def _garcia_bills() -> list[Bill]:
    return [
        Bill(id="auto", payee="Car payment", amount=380, due_in_days=3, kind="auto", late_fee=35),
        Bill(id="phone", payee="Phone bill", amount=85, due_in_days=5, kind="phone", late_fee=10),
        Bill(id="card", payee="Credit card minimum", amount=63, due_in_days=9, kind="other", late_fee=29),
        Bill(id="mortgage", payee="Mortgage", amount=1450, due_in_days=12, kind="mortgage", late_fee=72),
        Bill(id="utility", payee="Electric and water", amount=140, due_in_days=18, kind="utility", late_fee=15),
        Bill(id="streaming", payee="Streaming subscriptions", amount=32, due_in_days=8, kind="other", essential=False),
    ]


def _garcia_other_rooms() -> tuple[list[RoomScan], list[LossItem]]:
    """Rooms the Garcias recorded as home records (every 6 months) and scanned after the disaster.
    The live demo adds the Office."""
    rooms = {
        "Living room": [
            ("Sectional sofa", "furniture", 1400, 1800, 4, "destroyed"),
            ("55-inch TV", "electronics", 450, 600, 3, "destroyed"),
            ("Area rug", "decor", 250, 350, 5, "destroyed"),
            ("Coffee table", "furniture", 180, 260, 6, "damaged"),
        ],
        "Kitchen": [
            ("Refrigerator", "appliance", 1100, 1500, 6, "destroyed"),
            ("Microwave", "appliance", 120, 180, 4, "destroyed"),
            ("Dining table and chairs", "furniture", 600, 900, 8, "damaged"),
        ],
        "Main bedroom": [
            ("King bed and mattress", "furniture", 1500, 2200, 4, "destroyed"),
            ("Dresser", "furniture", 500, 800, 7, "destroyed"),
            ("Clothes and shoes", "clothing", 1200, 1800, 2, "destroyed"),
        ],
        "Laundry room": [
            ("Washer and dryer", "appliance", 1400, 1800, 5, "destroyed"),
        ],
        "Kids' bedroom": [
            ("Bunk bed with mattresses", "furniture", 700, 1000, 3, "destroyed"),
            ("Gaming console", "electronics", 400, 500, 2, "destroyed"),
            ("Clothes and shoes", "clothing", 500, 800, 1, "destroyed"),
        ],
    }
    scans, losses = [], []
    for room, items in rooms.items():
        before, after = [], []
        for i, (name, cat, lo, hi, age, cond) in enumerate(items):
            it = value_item(Item(name=name, category=cat, room=room, value_low=lo, value_high=hi, age_years=age, frame_ts=2.0 + i * 4))
            before.append(it)
            after.append(it.model_copy(update={"condition": cond, "frame_ts": 2.5 + i * 4}))
        today = date.today()
        # two home records: one about 11 months ago (before a few newer purchases) and the latest about 5 months ago
        older = [i for i in before if i.age_years >= 2] or before[:1]
        scans.append(RoomScan(room=room, phase="before", items=older, taken_on=today - timedelta(days=335)))
        scans.append(RoomScan(room=room, phase="before", items=before, taken_on=today - timedelta(days=152)))
        scans.append(RoomScan(room=room, phase="after", items=after, taken_on=today - timedelta(days=4)))
        from ..engine.compare import compare_items

        for l in compare_items(before, after):
            l.confirmed = True
            losses.append(l)
    return scans, losses


def garcia() -> Household:
    scans, losses = _garcia_other_rooms()
    h = Household(
        id=GARCIA_ID, name="The Garcias", zip="75208", lat=GARCIA_LOC[0], lng=GARCIA_LOC[1],
        monthly_income=3400, weekly_essential_spend=200, weekly_grocery_spend=120, deductible=2500,
        accounts=Accounts(checking=640, savings=900, cd=5000, cd_matures_in_days=35, ira=14000,
                          credit_card_balance=2100, credit_card_limit=3000, auto_loan_monthly=380, mortgage_monthly=1450),
        bills=_garcia_bills(), scans=scans, claim=Claim(losses=losses, expected_days_to_pay=21),
        disaster_mode=True, days_since_disaster=5, days_since_last_activity=5, outreach_unanswered=True,
        post_disaster_spend={"food": 260, "lodging": 0},
        displaced_nightly_cost=89,
        circle=[CircleMember(name="Ana Garcia", relation="Sister"), CircleMember(name="José Ramos", relation="Uncle"),
                CircleMember(name="Lucía Morales", relation="Friend")],
    )
    return score(label_bills(h))


def neighbor() -> Household:
    """Similar damage, strong savings: should rank below the Garcias."""
    g = garcia()
    h = g.model_copy(deep=True, update={
        "id": NEIGHBOR_ID, "name": "The Nguyens", "lat": GARCIA_LOC[0] + 0.0021, "lng": GARCIA_LOC[1] + 0.0017,
        "monthly_income": 7800, "days_since_last_activity": 0, "outreach_unanswered": False, "circle": [],
        "accounts": Accounts(checking=4200, savings=16500, cd=0, cd_matures_in_days=0, ira=52000,
                             credit_card_balance=400, credit_card_limit=10000, auto_loan_monthly=0, mortgage_monthly=1600),
    })
    h.claim.filed = True
    return score(h)


def synthetic_households(n: int, seed: int = 42) -> list[Household]:
    rng = random.Random(seed)
    out = []
    for i in range(n):
        # cluster most households near the disaster zone (southwest Dallas), the rest across the county
        if rng.random() < 0.65:
            lat = rng.gauss(GARCIA_LOC[0], 0.05)
            lng = rng.gauss(GARCIA_LOC[1], 0.06)
        else:
            lat = rng.uniform(32.55, 33.00)
            lng = rng.uniform(-97.05, -96.52)
        income = round(rng.lognormvariate(8.4, 0.45), -1)
        income = min(max(income, 1800), 20000)
        savings = round(max(0, rng.lognormvariate(7.3, 1.3)), -1)
        checking = round(max(50, rng.lognormvariate(6.6, 0.8)), -1)
        limit = rng.choice([1000, 2000, 3000, 5000, 8000, 12000])
        mortgage = round(income * rng.uniform(0.22, 0.38), -1)
        auto = rng.choice([0, 0, 280, 350, 420, 520])
        loss = round(max(0, rng.lognormvariate(8.6, 0.9)), -1) if rng.random() < 0.85 else 0.0
        deductible = rng.choice([1000, 1500, 2000, 2500, 5000])
        days_since = rng.randint(1, 6)
        filed = rng.random() < 0.55
        h = Household(
            id=f"hh{i:04d}", name=f"Household {i + 1}", zip=rng.choice(DALLAS_ZIPS),
            lat=round(lat, 5), lng=round(lng, 5), monthly_income=income,
            weekly_essential_spend=round(income * rng.uniform(0.035, 0.06), -1),
            weekly_grocery_spend=round(income * rng.uniform(0.02, 0.035), -1), deductible=deductible,
            accounts=Accounts(checking=checking, savings=savings, cd=rng.choice([0, 0, 0, 3000, 10000]),
                              cd_matures_in_days=rng.randint(10, 300), ira=rng.choice([0, 5000, 20000, 60000]),
                              credit_card_balance=round(limit * rng.uniform(0, 0.95), -1), credit_card_limit=limit,
                              auto_loan_monthly=auto, mortgage_monthly=mortgage),
            bills=[Bill(id="mortgage", payee="Mortgage", amount=mortgage, due_in_days=rng.randint(0, 29), kind="mortgage")]
            + ([Bill(id="auto", payee="Car payment", amount=auto, due_in_days=rng.randint(0, 29), kind="auto")] if auto else []),
            claim=Claim(filed=filed), disaster_mode=True, days_since_disaster=days_since,
            days_since_last_activity=rng.randint(0, days_since) // 2, outreach_unanswered=(not filed and rng.random() < 0.15),
            fragility_opt_in=rng.random() < 0.8, synthetic=True, documented_loss=loss,
        )
        out.append(score(h))
    return out


def synthetic_atms(n: int = 120, seed: int = 7) -> list[dict]:
    rng = random.Random(seed)
    banks = ["Bank", "Credit union", "Partner"]
    atms = []
    for i in range(n):
        lat = rng.gauss(DALLAS[0] - 0.03, 0.09)
        lng = rng.gauss(DALLAS[1] - 0.03, 0.1)
        near_zone = abs(lat - GARCIA_LOC[0]) < 0.012 and abs(lng - GARCIA_LOC[1]) < 0.012
        atms.append({
            "id": f"atm{i:03d}", "name": f"{rng.choice(banks)} ATM #{i + 1}",
            "lat": round(lat, 5), "lng": round(lng, 5),
            "working": not near_zone and rng.random() > 0.08,  # simulated outages in the disaster zone
            "hours": rng.choice(["24 hours", "6am–11pm"]), "source": "synthetic",
        })
    # guarantee one working ATM a short drive from the Garcias for the demo
    atms.append({"id": "atm_demo", "name": "Bank ATM – Jefferson Blvd", "lat": GARCIA_LOC[0] + 0.018,
                 "lng": GARCIA_LOC[1] + 0.021, "working": True, "hours": "24 hours", "source": "synthetic"})
    atms.append({"id": "atm_down", "name": "Partner ATM – Davis St", "lat": GARCIA_LOC[0] + 0.004,
                 "lng": GARCIA_LOC[1] - 0.003, "working": False, "hours": "24 hours", "source": "synthetic"})
    return atms


def garcia_purchases() -> list[dict]:
    """Purchase history used for the normal-spending baseline (also seeded into Nessie)."""
    rows = []
    for week in range(8, 0, -1):
        rows.append({"description": "Groceries – Fiesta Mart", "category": "groceries", "amount": 120, "days_ago": week * 7 + 4})
        rows.append({"description": "Gas – QuikTrip", "category": "gas", "amount": 45, "days_ago": week * 7 + 2})
        rows.append({"description": "Pharmacy – CVS", "category": "pharmacy", "amount": 20, "days_ago": week * 7 + 1})
    rows.append({"description": "Restaurant – Whataburger", "category": "restaurant", "amount": 72, "days_ago": 3})
    rows.append({"description": "Restaurant – Taqueria", "category": "restaurant", "amount": 64, "days_ago": 2})
    rows.append({"description": "Restaurant – Pizza Hut", "category": "restaurant", "amount": 74, "days_ago": 1})
    rows.append({"description": "Movie tickets", "category": "entertainment", "amount": 38, "days_ago": 1})
    return rows
