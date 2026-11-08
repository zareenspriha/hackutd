"""Runs the 2.5-minute demo against the API with mocks (no keys needed), plus unit checks on the money rules."""
import io
import os

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

os.environ.update({"GEMINI_API_KEY": "", "NESSIE_API_KEY": "", "MONGODB_URI": "", "SYNTHETIC_HOUSEHOLD_COUNT": "300"})

from app.engine.claim import apply_ale_rule  # noqa: E402
from app.engine.compare import compare_items  # noqa: E402
from app.engine.valuation import value_item  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Item, Receipt  # noqa: E402


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    os.environ["UPLOAD_DIR"] = str(tmp_path_factory.mktemp("uploads"))
    with TestClient(app) as c:
        c.post("/demo/reset")
        yield c


def _video(tmp_path) -> bytes:
    path = str(tmp_path / "v.mp4")
    w = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), 10, (320, 240))
    rng = np.random.default_rng(0)
    for _ in range(30):
        w.write(rng.integers(60, 255, (240, 320, 3), dtype=np.uint8))
    w.release()
    return open(path, "rb").read()


def test_ale_rule_matches_plan():
    from app.data.synthetic import garcia

    r = apply_ale_rule(garcia(), Receipt(merchant="x", category="food", total=210, days_covered=7))
    assert r.countable == 90


def test_compare_finds_missing_and_destroyed():
    before = [value_item(Item(name="Headphones", category="electronics", room="Office", value_low=150, value_high=250)),
              value_item(Item(name="Lamp", category="decor", room="Office", value_low=30, value_high=50))]
    after = [before[1].model_copy(update={"condition": "destroyed"})]
    losses = compare_items(before, after)
    assert {(l.name, l.status) for l in losses} == {("Headphones", "missing"), ("Lamp", "destroyed")}


def test_demo_flow(client, tmp_path):
    vid = _video(tmp_path)
    # State Farm
    r = client.post("/households/garcia/scan", data={"room": "Office", "phase": "before"},
                    files={"video": ("before.mp4", io.BytesIO(vid), "video/mp4")})
    assert r.status_code == 200, r.text
    assert len(r.json()["items"]) == 3
    r = client.post("/households/garcia/scan", data={"room": "Office", "phase": "after"},
                    files={"video": ("after.mp4", io.BytesIO(vid), "video/mp4")})
    losses = r.json()["losses"]
    assert [(l["name"], l["status"]) for l in losses] == [("Apple MacBook laptop", "missing")]
    assert client.get("/households/garcia/frame", params={"room": "Office", "phase": "before", "ts": 0.5}).status_code == 200
    client.post("/households/garcia/losses/review", json={"confirm_all_in_room": "Office"})

    ranked = client.get("/insurer/households", params={"limit": 400}).json()["households"]
    ids = [h["id"] for h in ranked]
    assert ids.index("garcia") < ids.index("nguyen")
    garcia_row = ranked[ids.index("garcia")]
    assert "No claim started" in garcia_row["reasons"]
    assert "checking" not in str(garcia_row).lower()  # no balances on the map

    # Capital One
    home = client.get("/households/garcia").json()
    titles = [s["title"] for s in home["next_steps"]]
    assert titles[0].startswith("File your insurance claim") and "Bridge Funds" in home["next_steps"][0]["why"]
    assert client.post("/households/garcia/bridge/disburse").status_code == 400  # claim must be filed first
    client.post("/households/garcia/claim/file")
    titles = [s["title"] for s in client.get("/households/garcia").json()["next_steps"]]
    assert "Bridge Funds" in titles[0]
    r = client.post("/households/garcia/bridge/disburse")
    assert r.status_code == 200 and 0 < r.json()["amount"] <= 5000
    bills = client.get("/households/garcia/bills").json()["bills"]
    labels = {b["id"]: b["label"] for b in bills}
    assert labels["auto"] == "pay_now" and labels["phone"] == "pay_now" and labels["mortgage"] == "call_about"
    assert client.post("/households/garcia/help-circle", json={"from_name": "Sister Ana", "amount": 200}).json()["received"] == 200
    atm = client.get("/households/garcia/cash-access").json()
    assert atm["nearest_working"]["working"] is True

    # PNC
    a = client.post("/households/garcia/coach", json={"question": "Can I afford a hotel for two weeks?"}).json()
    assert a["intent"] == "afford" and a["facts"]["affordable"] is True
    assert "CD" in a["answer"] and a["next_step"]
    w = client.get("/households/garcia/what-if", params={"claim_delay_days": 42}).json()
    assert w["forecast"]["payout_day"] == 42 and len(w["indicators"]) == 4
    r = client.post("/households/garcia/receipt", files={"photo": ("r.jpg", io.BytesIO(cv2.imencode(".jpg", np.full((50, 50, 3), 200, np.uint8))[1].tobytes()), "image/jpeg")})
    assert r.json()["receipt"]["countable"] == 90

    # payout repays Bridge Funds
    p = client.post("/households/garcia/insurance-payout").json()
    assert p["bridge_repaid"] > 0
