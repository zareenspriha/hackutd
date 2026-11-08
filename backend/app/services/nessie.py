"""Capital One Nessie v2 API client (https://v2.nessieisreal.com) with a local mock.

v2 notes: key goes in `Authorization: Bearer nsk_...` (never the query string); money is in integer cents
(`amount_cents`, `balance_cents`) except bills (`payment_amount`, dollars); objects use `id`; lists return `{"items": [...]}`.

The household document is the source of truth for the app's math; every money move (Bridge Funds deposit,
Help Circle P2P transfer, insurance payout, bill payment) is mirrored to Nessie when a key is set.
"""
from __future__ import annotations

import logging
import uuid
from datetime import date, timedelta

import httpx

from ..config import get_settings
from ..models import Household

log = logging.getLogger("aftershock.nessie")


class NessieError(RuntimeError):
    pass


def cents(dollars: float) -> int:
    return int(round(dollars * 100))


class Nessie:
    def __init__(self) -> None:
        s = get_settings()
        self.mock = s.use_mock_nessie
        self.key = s.nessie_api_key
        self.base = s.nessie_base_url.rstrip("/")
        self.log: list[dict] = []  # mock ledger, also handy for the demo

    # ---------- low level ----------
    async def _req(self, method: str, path: str, json: dict | None = None, params: dict | None = None):
        if self.mock:
            self.log.append({"method": method, "path": path, "body": json})
            return {"id": uuid.uuid4().hex[:24], **(json or {})} if method == "POST" else {"items": []}
        headers = {"Authorization": f"Bearer {self.key}"}
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.request(method, f"{self.base}{path}", params=params, json=json, headers=headers)
        if r.status_code >= 400:
            raise NessieError(f"{method} {path} -> {r.status_code}: {r.text[:200]}")
        return r.json() if r.content else {}

    @staticmethod
    def _id(resp: dict) -> str:
        return resp.get("id", "")

    async def health(self) -> bool:
        if self.mock:
            return True
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(f"{self.base}/health")
        return r.status_code == 200

    # ---------- customers & accounts ----------
    async def create_customer(self, first: str, last: str, zip_code: str) -> str:
        body = {"first_name": first, "last_name": last,
                "address": {"street_number": "100", "street_name": "Main St", "city": "Dallas", "state": "TX", "zip": zip_code}}
        return self._id(await self._req("POST", "/customers", body))

    async def create_account(self, customer_id: str, kind: str, nickname: str, balance: float, credit_limit: float = 0) -> str:
        body = {"type": kind, "nickname": nickname, "rewards": 0, "balance_cents": cents(balance)}
        if kind == "Credit Card" and credit_limit:
            body["credit_limit_cents"] = cents(credit_limit)
        return self._id(await self._req("POST", f"/customers/{customer_id}/accounts", body))

    async def get_account(self, account_id: str) -> dict:
        return await self._req("GET", f"/accounts/{account_id}")

    # ---------- merchants & purchases ----------
    async def create_merchant(self, name: str, category: str, lat: float, lng: float) -> str:
        body = {"name": name, "category": category,
                "address": {"street_number": "1", "street_name": "Main St", "city": "Dallas", "state": "TX", "zip": "75208"},
                "geocode": {"lat": lat, "lng": lng}}
        return self._id(await self._req("POST", "/merchants", body))

    async def create_purchase(self, account_id: str, merchant_id: str, amount: float, description: str) -> str:
        body = {"merchant_id": merchant_id, "medium": "balance", "amount_cents": cents(amount), "description": description}
        return self._id(await self._req("POST", f"/accounts/{account_id}/purchases", body))

    async def list_purchases(self, account_id: str, limit: int = 100) -> list[dict]:
        """Purchases from the account's transaction list, converted to dollars."""
        r = await self._req("GET", f"/accounts/{account_id}/transactions", params={"limit": limit})
        out = []
        for t in r.get("items") or []:
            if t.get("kind") == "purchase":
                out.append({"description": t.get("description", ""), "amount": t.get("amount_cents", 0) / 100,
                            "purchase_date": (t.get("created_at") or "")[:10], "status": t.get("status")})
        return out

    # ---------- bills, deposits, withdrawals, transfers ----------
    async def create_bill(self, account_id: str, payee: str, amount: float, due: date) -> str:
        body = {"status": "pending", "payee": payee, "nickname": payee, "payment_date": due.isoformat(),
                "recurring_date": min(due.day, 28), "payment_amount": round(amount, 2)}
        return self._id(await self._req("POST", f"/accounts/{account_id}/bills", body))

    async def deposit(self, account_id: str, amount: float, description: str) -> str:
        body = {"medium": "balance", "amount_cents": cents(amount), "description": description}
        return self._id(await self._req("POST", f"/accounts/{account_id}/deposits", body))

    async def withdraw(self, account_id: str, amount: float, description: str) -> str:
        body = {"medium": "balance", "amount_cents": cents(amount), "description": description}
        return self._id(await self._req("POST", f"/accounts/{account_id}/withdrawals", body))

    async def transfer(self, from_account: str, to_account: str, amount: float, description: str) -> str:
        body = {"medium": "balance", "payee_id": to_account, "amount_cents": cents(amount), "description": description}
        return self._id(await self._req("POST", f"/accounts/{from_account}/transfers", body))

    # ---------- ATMs ----------
    async def atms(self) -> list[dict]:
        """All ATMs (v2 has no geo filter; the caller sorts by distance)."""
        if self.mock:
            return []
        r = await self._req("GET", "/atms")
        out = []
        for a in r.get("items") or []:
            geo = a.get("geocode") or {}
            if "lat" in geo and "lng" in geo:
                out.append({"id": a.get("id"), "name": a.get("name", "ATM"), "lat": geo["lat"], "lng": geo["lng"],
                            "hours": ", ".join((a.get("hours") or [])[:1]), "working": (a.get("amount_left") or 1) > 0,
                            "source": "nessie"})
        return out

    # ---------- seeding ----------
    async def seed_household(self, h: Household, purchases: list[dict]) -> Household:
        """Create the customer, checking/savings/credit card, purchase history and bills in Nessie."""
        a = h.accounts
        cust = await self.create_customer("Maria", "Garcia", h.zip)
        h.nessie_customer_id = cust
        h.nessie_checking_id = await self.create_account(cust, "Checking", "Garcia Checking", a.checking)
        h.nessie_savings_id = await self.create_account(cust, "Savings", "Garcia Savings", a.savings)
        h.nessie_credit_id = await self.create_account(cust, "Credit Card", "Garcia Card", a.credit_card_balance,
                                                       credit_limit=a.credit_card_limit)
        # v2 purchases can't be backdated and are debited from the balance, so seed a small recent history only.
        merchants: dict[str, str] = {}
        for p in purchases[-8:]:
            name = p["description"].split("–")[-1].strip()
            if name not in merchants:
                merchants[name] = await self.create_merchant(name, p["category"], h.lat, h.lng)
            await self.create_purchase(h.nessie_credit_id, merchants[name], p["amount"], p["description"])
        today = date.today()
        for b in h.bills:
            await self.create_bill(h.nessie_checking_id, b.payee, b.amount, today + timedelta(days=b.due_in_days))
        return h


_nessie: Nessie | None = None


def get_nessie() -> Nessie:
    global _nessie
    if _nessie is None:
        _nessie = Nessie()
    return _nessie
