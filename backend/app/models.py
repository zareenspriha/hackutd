"""Pydantic models. A Household is one document holding everything about a family."""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

Condition = Literal["good", "damaged", "destroyed"]


# ---------- Scanning / claim ----------

class Item(BaseModel):
    name: str
    category: str
    room: str
    condition: Condition = "good"
    value_low: float
    value_high: float
    age_years: float = 2.0
    frame_ts: float | None = None  # seconds into the video where the item is clearest
    replacement_cost: float = 0.0
    actual_cash_value: float = 0.0


class RoomScan(BaseModel):
    room: str
    phase: Literal["before", "after"]
    items: list[Item] = []
    missing_areas: list[str] = []
    quality_warnings: list[str] = []
    video_path: str | None = None


class LossItem(BaseModel):
    name: str
    category: str
    room: str
    status: Literal["missing", "damaged", "destroyed"]
    replacement_cost: float
    actual_cash_value: float
    before_frame_ts: float | None = None
    after_frame_ts: float | None = None
    confirmed: bool = False  # family reviewed it


class DamageLine(BaseModel):
    description: str
    area: str
    estimated_cost: float
    photo_path: str | None = None


class Receipt(BaseModel):
    merchant: str
    category: Literal["food", "lodging", "transport", "other"]
    total: float
    days_covered: int = 7
    countable: float = 0.0  # portion above normal spending
    explanation: str = ""
    photo_path: str | None = None


class Claim(BaseModel):
    filed: bool = False
    filed_on: date | None = None
    losses: list[LossItem] = []
    damage: list[DamageLine] = []
    receipts: list[Receipt] = []
    expected_days_to_pay: int = 21
    paid: bool = False


# ---------- Banking ----------

class Bill(BaseModel):
    id: str
    payee: str
    amount: float
    due_in_days: int
    kind: Literal["mortgage", "auto", "phone", "utility", "insurance", "other"] = "other"
    essential: bool = True
    status: Literal["pending", "paid", "moved"] = "pending"
    label: Literal["pay_now", "move", "call_about"] | None = None
    late_fee: float = 0.0
    late_fee_paused: bool = False


class Accounts(BaseModel):
    checking: float
    savings: float
    cd: float
    cd_matures_in_days: int
    ira: float
    credit_card_balance: float
    credit_card_limit: float
    auto_loan_monthly: float
    personal_loan_monthly: float = 0.0
    mortgage_monthly: float


class BridgeFunds(BaseModel):
    amount: float = 0.0
    disbursed: bool = False
    repaid: bool = False


class HelpTransfer(BaseModel):
    from_name: str
    amount: float
    note: str = ""


class Household(BaseModel):
    id: str
    name: str
    zip: str
    lat: float
    lng: float
    monthly_income: float
    weekly_essential_spend: float  # food, meds, gas, etc. (not housing/debt bills)
    weekly_grocery_spend: float
    deductible: float
    accounts: Accounts
    bills: list[Bill] = []
    claim: Claim = Field(default_factory=Claim)
    scans: list[RoomScan] = []
    bridge: BridgeFunds = Field(default_factory=BridgeFunds)
    help_circle: list[HelpTransfer] = []
    disaster_mode: bool = False
    days_since_disaster: int = 0
    days_since_last_activity: int = 0
    outreach_unanswered: bool = False
    fragility_opt_in: bool = True
    synthetic: bool = False
    # spending since the disaster by category, from Nessie purchases (used to nudge for receipts)
    post_disaster_spend: dict[str, float] = {}
    mortgage_pause_requested: bool = False
    # Nessie ids (set when real Nessie is used)
    nessie_customer_id: str | None = None
    nessie_checking_id: str | None = None
    nessie_savings_id: str | None = None
    nessie_credit_id: str | None = None
    # pre-computed for the map (cheap for 2,000 rows)
    priority_score: float = 0.0
    priority_reasons: list[str] = []
    documented_loss: float = 0.0


# ---------- What-if ----------

class Scenario(BaseModel):
    claim_delay_days: int | None = None  # override expected days to pay
    payout_pct: float = 1.0  # 0.7 = insurance pays 70%
    missed_work_days: int = 0
