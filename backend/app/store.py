"""Storage. MongoDB Atlas when MONGODB_URI is set, otherwise an in-memory store with the same interface."""
from __future__ import annotations

import math
from typing import Protocol

from .config import get_settings
from .models import Household


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


class Store(Protocol):
    async def get(self, household_id: str) -> Household | None: ...
    async def save(self, h: Household) -> None: ...
    async def save_many(self, hs: list[Household]) -> None: ...
    async def count(self) -> int: ...
    async def top_priority(self, limit: int) -> list[Household]: ...
    async def save_atms(self, atms: list[dict]) -> None: ...
    async def nearby_atms(self, lat: float, lng: float, km: float, limit: int) -> list[dict]: ...
    async def clear(self) -> None: ...


class MemoryStore:
    def __init__(self) -> None:
        self.households: dict[str, Household] = {}
        self.atms: list[dict] = []

    async def get(self, household_id: str) -> Household | None:
        h = self.households.get(household_id)
        return h.model_copy(deep=True) if h else None

    async def save(self, h: Household) -> None:
        self.households[h.id] = h.model_copy(deep=True)

    async def save_many(self, hs: list[Household]) -> None:
        for h in hs:
            self.households[h.id] = h

    async def count(self) -> int:
        return len(self.households)

    async def top_priority(self, limit: int) -> list[Household]:
        return sorted(self.households.values(), key=lambda h: -h.priority_score)[:limit]

    async def save_atms(self, atms: list[dict]) -> None:
        self.atms = atms

    async def nearby_atms(self, lat: float, lng: float, km: float, limit: int) -> list[dict]:
        out = []
        for a in self.atms:
            d = haversine_km(lat, lng, a["lat"], a["lng"])
            if d <= km:
                out.append({**a, "distance_km": round(d, 2)})
        return sorted(out, key=lambda a: a["distance_km"])[:limit]

    async def clear(self) -> None:
        self.households.clear()
        self.atms.clear()


class MongoStore:
    def __init__(self, uri: str, db_name: str) -> None:
        import certifi
        from pymongo import AsyncMongoClient

        # certifi's CA bundle: python.org installs on macOS don't trust Atlas's certificate otherwise
        self.client = AsyncMongoClient(uri, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=10000)
        self.db = self.client[db_name]
        self.households = self.db["households"]
        self.atm_col = self.db["atms"]
        self._indexed = False

    async def _ensure_indexes(self) -> None:
        if self._indexed:
            return
        await self.households.create_index([("location", "2dsphere")])
        await self.households.create_index([("priority_score", -1)])
        await self.atm_col.create_index([("location", "2dsphere")])
        self._indexed = True

    @staticmethod
    def _doc(h: Household) -> dict:
        d = h.model_dump(mode="json")
        d["_id"] = h.id
        d["location"] = {"type": "Point", "coordinates": [h.lng, h.lat]}
        return d

    @staticmethod
    def _model(d: dict) -> Household:
        d.pop("_id", None)
        d.pop("location", None)
        return Household.model_validate(d)

    async def get(self, household_id: str) -> Household | None:
        d = await self.households.find_one({"_id": household_id})
        return self._model(d) if d else None

    async def save(self, h: Household) -> None:
        await self._ensure_indexes()
        await self.households.replace_one({"_id": h.id}, self._doc(h), upsert=True)

    async def save_many(self, hs: list[Household]) -> None:
        await self._ensure_indexes()
        from pymongo import ReplaceOne

        ops = [ReplaceOne({"_id": h.id}, self._doc(h), upsert=True) for h in hs]
        for i in range(0, len(ops), 500):
            await self.households.bulk_write(ops[i : i + 500])

    async def count(self) -> int:
        return await self.households.count_documents({})

    async def top_priority(self, limit: int) -> list[Household]:
        cur = self.households.find({}).sort("priority_score", -1).limit(limit)
        return [self._model(d) async for d in cur]

    async def save_atms(self, atms: list[dict]) -> None:
        await self._ensure_indexes()
        await self.atm_col.delete_many({})
        docs = [{**a, "location": {"type": "Point", "coordinates": [a["lng"], a["lat"]]}} for a in atms]
        if docs:
            await self.atm_col.insert_many(docs)

    async def nearby_atms(self, lat: float, lng: float, km: float, limit: int) -> list[dict]:
        cur = self.atm_col.find(
            {"location": {"$near": {"$geometry": {"type": "Point", "coordinates": [lng, lat]}, "$maxDistance": km * 1000}}}
        ).limit(limit)
        out = []
        async for a in cur:
            a.pop("_id", None)
            a.pop("location", None)
            a["distance_km"] = round(haversine_km(lat, lng, a["lat"], a["lng"]), 2)
            out.append(a)
        return out

    async def clear(self) -> None:
        await self.households.delete_many({})
        await self.atm_col.delete_many({})


_store: Store | None = None


def get_store() -> Store:
    global _store
    if _store is None:
        s = get_settings()
        _store = MemoryStore() if s.use_memory_db else MongoStore(s.mongodb_uri, s.mongodb_db)
    return _store
