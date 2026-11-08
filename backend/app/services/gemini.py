"""Gemini: reads videos, photos and receipts, and writes plain-language wording. Never does money math.

Without GEMINI_API_KEY, every call returns deterministic demo data (the demo table) so the app runs offline.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Literal

from pydantic import BaseModel

from ..config import get_settings
from . import cv_checks

log = logging.getLogger("looma.gemini")


# ---------- response schemas ----------

class GItem(BaseModel):
    name: str
    category: Literal["electronics", "appliance", "furniture", "clothing", "kitchen", "decor", "tools", "sports", "accessories", "other"]
    condition: Literal["good", "damaged", "destroyed"]
    value_low: float
    value_high: float
    age_years: float
    frame_ts: float


class GRoom(BaseModel):
    items: list[GItem]
    missing_areas: list[str]


class GDamage(BaseModel):
    description: str
    area: str
    estimated_cost: float


class GReceipt(BaseModel):
    merchant: str
    category: Literal["food", "lodging", "transport", "other"]
    total: float
    days_covered: int


ROOM_PROMPT = """You are helping a family document belongings for a home insurance claim.
Room: {room}. This is the {phase} video ({phase_hint}).
List every distinct household item you can see. For each item give:
- name (short, specific, e.g. "Silver laptop", "Over-ear headphones")
- category
- condition: good, damaged (wet, cracked, dented, repairable) or destroyed (soaked through, broken, unusable)
- value_low / value_high: price range in USD to buy the same item new today
- age_years: your best guess of its age
- frame_ts: seconds into the video where the item is clearest (0 if from still images: use the image index)
Also list missing_areas: at most 2 places inside this room where belongings are usually kept but the video
didn't show, written as "I didn't see the closet" (closets, cabinets, drawers, shelves, under the bed). Never list walls,
ceilings, floors, hallways or other rooms. Leave it empty if the video covers the main area where things are kept.
Only list items actually visible. Do not guess hidden items."""

DAMAGE_PROMPT = """This photo shows damage to a home after a disaster. Describe the main damage in one short line,
name the area (e.g. "Living room floor"), and estimate a repair cost in USD for a typical Texas contractor."""

RECEIPT_PROMPT = """Read this receipt. Return the merchant, the category (food for restaurants/groceries, lodging for
hotels/motels/rentals, transport for gas/rides/car rental, other otherwise), the total in USD, and how many days it covers
(1 for a single meal or purchase; number of nights for lodging)."""


# ---------- mock data (the demo table) ----------

# Matches our recorded demo videos: a laptop, a white box and a Coke can on a bench; the laptop is gone after.
DEMO_TABLE = [
    ("Apple MacBook laptop", "electronics", 1200, 1500, 2, 3.0),
    ("White cardboard box", "other", 3, 8, 0, 0.0),
    ("Coke can", "other", 1, 3, 0, 0.0),
]


def _mock_room(room: str, phase: str) -> GRoom:
    items = []
    for name, cat, lo, hi, age, ts in DEMO_TABLE:
        if phase == "after" and name.startswith("Apple MacBook"):
            continue  # taken away when "the flood hits"
        items.append(GItem(name=name, category=cat, condition="good", value_low=lo, value_high=hi, age_years=age, frame_ts=ts))
    return GRoom(items=items, missing_areas=[])


# ---------- client ----------

class Gemini:
    def __init__(self) -> None:
        s = get_settings()
        self.mock = s.use_mock_gemini
        self.model = s.gemini_model
        # tried in order when a model is overloaded (503) or out of quota (429)
        self.models = [self.model] + [m.strip() for m in s.gemini_fallback_models.split(",") if m.strip() and m.strip() != self.model]
        self.client = None
        if not self.mock:
            from google import genai
            from google.genai import types

            # no long SDK retry loops: on a busy model we switch to the next one instead of waiting minutes
            self.client = genai.Client(api_key=s.gemini_api_key, http_options=types.HttpOptions(
                timeout=60000, retry_options=types.HttpRetryOptions(attempts=1)))

    def _call(self, contents, config=None):
        """generate_content with automatic fallback to the next model when one is busy."""
        last: Exception | None = None
        for m in self.models:
            try:
                return self.client.models.generate_content(model=m, contents=contents, config=config)
            except Exception as e:  # noqa: BLE001
                code = getattr(e, "code", None)
                if code in (429, 500, 503, 504) or "UNAVAILABLE" in str(e) or "timed out" in str(e).lower():
                    log.warning("Gemini model %s busy (%s); trying next", m, code or type(e).__name__)
                    last = e
                    continue
                raise
        raise last or RuntimeError("No Gemini model available")

    def _generate(self, contents, schema: type[BaseModel]) -> BaseModel:
        from google.genai import types

        config = types.GenerateContentConfig(response_mime_type="application/json", response_schema=schema, temperature=0.2)
        return schema.model_validate_json(self._call(contents, config).text)

    # ---- room video ----
    def _room_from_video(self, path: str, prompt: str) -> GRoom:
        f = self.client.files.upload(file=path)
        deadline = time.time() + 90
        while getattr(f.state, "name", str(f.state)) == "PROCESSING":
            if time.time() > deadline:
                raise TimeoutError("Gemini video processing timed out")
            time.sleep(1.5)
            f = self.client.files.get(name=f.name)
        if getattr(f.state, "name", str(f.state)) == "FAILED":
            raise RuntimeError("Gemini could not process the video")
        try:
            return self._generate([f, prompt], GRoom)
        finally:
            try:
                self.client.files.delete(name=f.name)  # don't keep the family's video around
            except Exception:  # noqa: BLE001
                pass

    def _room_from_frames(self, path: str, prompt: str) -> GRoom:
        from google.genai import types

        frames = cv_checks.extract_jpeg_frames(path, every_s=1.0)
        if not frames:
            raise RuntimeError("No frames could be read from the video")
        parts: list = [prompt + "\nThese are frames taken one per second; frame_ts = the seconds label before each image."]
        for ts, jpg in frames:
            parts.append(f"t={ts:.0f}s")
            parts.append(types.Part.from_bytes(data=jpg, mime_type="image/jpeg"))
        return self._generate(parts, GRoom)

    def analyze_room_sync(self, path: str, room: str, phase: str) -> tuple[GRoom, str]:
        """Returns (result, method) where method is 'video', 'frames' or 'mock'."""
        if self.mock:
            return _mock_room(room, phase), "mock"
        hint = "before any disaster" if phase == "before" else "after the disaster: note anything wet, broken or gone"
        prompt = ROOM_PROMPT.format(room=room, phase=phase, phase_hint=hint)
        try:
            return self._room_from_video(path, prompt), "video"
        except Exception as e:  # noqa: BLE001
            log.warning("Video analysis failed (%s); falling back to 1 fps frames", e)
            return self._room_from_frames(path, prompt), "frames"

    async def analyze_room(self, path: str, room: str, phase: str) -> tuple[GRoom, str]:
        return await asyncio.to_thread(self.analyze_room_sync, path, room, phase)

    # ---- photos / receipts ----
    def _image(self, data: bytes, mime: str, prompt: str, schema: type[BaseModel]) -> BaseModel:
        from google.genai import types

        return self._generate([types.Part.from_bytes(data=data, mime_type=mime), prompt], schema)

    async def read_damage(self, data: bytes, mime: str) -> GDamage:
        if self.mock:
            return GDamage(description="Water-damaged drywall, about 2 feet high", area="Living room walls", estimated_cost=1850)
        return await asyncio.to_thread(self._image, data, mime, DAMAGE_PROMPT, GDamage)

    async def read_receipt(self, data: bytes, mime: str) -> GReceipt:
        if self.mock:
            return GReceipt(merchant="Whataburger and Taqueria (week)", category="food", total=210, days_covered=7)
        return await asyncio.to_thread(self._image, data, mime, RECEIPT_PROMPT, GReceipt)

    # ---- wording ----
    def _write_sync(self, instruction: str, facts: dict) -> str:
        prompt = (
            "You are Looma's Recovery Coach, helping a family after a disaster. "
            "Rewrite the answer below in warm, plain language: at most 3 short sentences. "
            "Use ONLY the numbers in the facts. Never invent amounts, dates or advice.\n\n"
            f"Task: {instruction}\nFacts (JSON): {json.dumps(facts, default=str)}"
        )
        return (self._call(prompt).text or "").strip()

    async def write(self, instruction: str, facts: dict, fallback: str) -> str:
        """Plain-language wording. Falls back to the template text on any failure."""
        if self.mock:
            return fallback
        try:
            text = await asyncio.wait_for(asyncio.to_thread(self._write_sync, instruction, facts), timeout=12)
            return text or fallback
        except Exception as e:  # noqa: BLE001
            log.warning("Gemini wording failed: %s", e)
            return fallback


_gemini: Gemini | None = None


def get_gemini() -> Gemini:
    global _gemini
    if _gemini is None:
        _gemini = Gemini()
    return _gemini
