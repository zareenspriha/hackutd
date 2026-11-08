"""Coordination, trust and safety: responders sign their actions, families see them, no balances leak."""
import os

import pytest
from fastapi.testclient import TestClient

os.environ.update({"GEMINI_API_KEY": "", "NESSIE_API_KEY": "", "MONGODB_URI": "", "SYNTHETIC_HOUSEHOLD_COUNT": "300"})

from app.main import app  # noqa: E402

STAFF = {"X-Staff": "Jordan Reyes"}


@pytest.fixture()
def c():
    with TestClient(app) as client:
        client.post("/demo/reset")
        yield client


def test_responder_actions_need_a_signed_in_responder(c):
    assert c.post("/insurer/households/garcia/reach-out", json={}).status_code == 401
    assert c.post("/insurer/sweep").status_code == 401


def test_outreach_and_assignment_reach_the_family(c):
    assert c.post("/insurer/households/garcia/reach-out", json={"kind": "check_in"}, headers=STAFF).status_code == 200
    assert c.post("/insurer/households/garcia/assign", json={"to": "Dana Lee"}, headers=STAFF).json()["assigned_to"] == "Dana Lee"
    home = c.get("/households/garcia").json()
    assert home["assigned_to"] == "Dana Lee" and home["messages"]
    actors = [e["actor"] for e in c.get("/households/garcia/activity").json()["events"]]
    assert "Responder Jordan Reyes" in actors


def test_sweep_leaves_no_urgent_household_unreached(c):
    before = c.get("/insurer/summary").json()
    assert before["overlooked"] > 0
    r = c.post("/insurer/sweep", headers=STAFF).json()
    assert r["reached"] == before["overlooked"] and r["overlooked"] == 0 and r["coverage_pct"] == 100


def test_asking_for_help_only_moves_a_family_up(c):
    def score():
        rows = c.get("/insurer/households", params={"limit": 400}).json()["households"]
        return next(h for h in rows if h["id"] == "garcia")
    c.post("/households/garcia/check-in", json={"safe": True, "needs": []})
    base = score()["score"]
    c.post("/households/garcia/check-in", json={"safe": False, "needs": ["shelter", "food"]})
    row = score()
    assert row["score"] > base and row["reasons"][0].startswith("Not safe")


def test_responders_never_see_balances(c):
    rows = c.get("/insurer/households", params={"limit": 400}).json()["households"]
    keys = {k for r in rows for k in r}
    assert not keys & {"accounts", "checking", "savings", "balance", "credit_card_balance", "ira", "help_circle", "activity"}
    assert "$" not in str(rows)  # reasons only, never amounts


def test_duplicate_receipts_and_bills_are_blocked(c):
    body = {"merchant": "Motel 6", "category": "lodging", "total": 445}
    assert c.post("/households/garcia/receipt/manual", json=body).status_code == 200
    assert c.post("/households/garcia/receipt/manual", json=body).status_code == 409
    bill = next(b for b in c.get("/households/garcia/bills").json()["bills"] if b["status"] == "pending")
    c.post(f"/households/garcia/bills/{bill['id']}", json={"action": "move"})
    assert c.post(f"/households/garcia/bills/{bill['id']}", json={"action": "move"}).status_code == 409


def test_claim_check_flags_raised_values(c):
    assert c.get("/households/garcia/claim/check").json()["ready"]
    c.post("/households/garcia/losses/review", json={"edits": [{"index": 0, "replacement_cost": 9000, "confirmed": True}]})
    chk = c.get("/households/garcia/claim/check").json()
    assert not chk["ready"] and any(x["id"] == "values" and x["status"] == "review" for x in chk["checks"])


def test_coach_spots_scams_and_never_invents_numbers(c):
    r = c.post("/households/garcia/coach", json={"question": "A contractor wants $3,000 upfront to start"}).json()
    assert r["intent"] == "scam" and r["card"]["kind"] == "safety"
    from app.services.coach import _numbers_ok
    assert _numbers_ok("You have $640.", "You have $640.", {})
    assert not _numbers_ok("You have $9,999.", "You have $640.", {"checking": 640})


def test_money_moves_carry_a_bank_reference(c):
    c.post("/households/garcia/claim/file")
    r = c.post("/households/garcia/bridge/disburse", json={"amount": 500}).json()
    assert r["nessie_transaction_id"]
    ev = c.get("/households/garcia/activity").json()["events"][0]
    assert ev["bank_ref"] == r["nessie_transaction_id"] and ev["amount"] == 500


def test_uploads_reject_wrong_file_types(c):
    r = c.post("/households/garcia/receipt", files={"photo": ("x.exe", b"MZ", "application/octet-stream")})
    assert r.status_code == 415


def test_home_records_keep_a_history_and_compare_uses_the_newest(c):
    rec = c.get("/households/garcia/home-record").json()
    living = next(r for r in rec["rooms"] if r["room"] == "Living room")
    assert len(living["records"]) == 2 and living["records"][0]["taken_on"] > living["records"][1]["taken_on"]
    assert living["next_due"] and not living["overdue"]
    cmp = c.get("/households/garcia/compare", params={"room": "Living room"}).json()
    assert cmp["before_taken_on"] == living["last_recorded"] and cmp["records"] == 2
    # one record per room per day: recording twice today keeps one
    c.post("/demo/scan", params={"phase": "before", "room": "Office"})
    c.post("/demo/scan", params={"phase": "before", "room": "Office"})
    office = next(r for r in c.get("/households/garcia/home-record").json()["rooms"] if r["room"] == "Office")
    assert len(office["records"]) == 1


def test_proof_frames_skip_black_frames_and_crop(tmp_path):
    import cv2
    import numpy as np

    from app.services import cv_checks

    path = str(tmp_path / "v.mp4")
    w = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), 10, (320, 240))
    rng = np.random.default_rng(1)
    for i in range(40):  # first second black (camera warming up), then a real scene
        f = np.zeros((240, 320, 3), np.uint8) if i < 10 else rng.integers(60, 200, (240, 320, 3), dtype=np.uint8)
        w.write(f)
    w.release()
    frames = cv_checks.index_frames(path)
    assert frames and frames[0]["ts"] >= 0.9  # black frames skipped
    jpg = cv_checks.frame_at(path, 0.0, [100, 100, 600, 600], "crop")
    img = cv2.imdecode(np.frombuffer(jpg, np.uint8), cv2.IMREAD_COLOR)
    assert img.shape[:2] == (320, 320) and img.mean() > 30


def test_bridge_funds_safety_rules(c):
    o = c.get("/households/garcia/bridge").json()
    assert not o["eligible"] and "File your claim" in o["reason"]
    c.post("/households/garcia/claim/file")
    o = c.get("/households/garcia/bridge").json()
    assert o["eligible"] and o["limit"] <= o["limits"]["half_of_payout"] and o["limit"] <= 5000
    assert o["presets"][-1]["label"] == "Max"
    r = c.post("/households/garcia/bridge/disburse", json={"amount": 999999}).json()
    assert r["drawn"] == o["limit"]  # never more than the limit


def test_help_request_shows_real_status(c):
    r = c.post("/households/garcia/check-in", json={"safe": False, "needs": ["shelter", "cash"], "note": "two kids",
                                                    "lat": 32.9, "lng": -96.8}).json()
    assert r["rank"] and [t["done"] for t in r["timeline"]] == [True, False, False]
    assert r["location"]["lat"] == 32.9 and {x["need"] for x in r["self_help"]} == {"shelter", "cash"}
    c.post("/insurer/households/garcia/assign", headers={"X-Staff": "Jordan"}, json={"to": "Jordan"})
    st = c.get("/households/garcia/help-status").json()
    assert st["timeline"][1]["done"] and st["timeline"][1]["detail"] == "Jordan"


def test_circle_asks_only_the_people_picked(c):
    r = c.post("/households/garcia/circle/request", json={"names": ["Ana Garcia"]}).json()
    asked = {m["name"]: m["invited"] for m in r["members"]}
    assert asked["Ana Garcia"] and not asked["José Ramos"]


def test_coach_explains_a_next_step_and_asks_trip_cost(c):
    home = c.get("/households/garcia").json()
    sid = home["next_steps"][0]["id"]
    r = c.post("/households/garcia/coach", json={"question": "How do I do this?", "step_id": sid}).json()
    assert r["intent"] == "step" and r["actions"] and r["follow_ups"]
    r = c.post("/households/garcia/coach", json={"question": "Can I still take that vacation?"}).json()
    assert "how much" in r["answer"].lower() and r["follow_ups"]
    r = c.post("/households/garcia/coach", json={"question": "what about $300?",
               "history": [{"role": "user", "text": "Can I still take that vacation?"}]}).json()
    assert r["intent"] == "vacation" and "$300" in r["draft"]


def test_storm_replays_the_sweep_and_keeps_garcia_first(c):
    staff = {"X-Staff": "Jordan"}
    first = c.post("/insurer/sweep", headers=staff).json()["reached"]
    assert first > 0 and c.post("/insurer/sweep", headers=staff).json()["reached"] == 0
    c.post("/demo/storm")
    assert c.post("/insurer/sweep", headers=staff).json()["reached"] == first  # replayable
    top = c.get("/insurer/households", params={"limit": 1}).json()["households"][0]
    assert top["id"] == "garcia" and top["last_contact"]["kind"] == "sweep"


def test_responder_and_family_can_message_each_other(c):
    staff = {"X-Staff": "Jordan"}
    assert c.post("/insurer/households/garcia/reach-out", headers=staff, json={"kind": "message", "note": ""}).status_code == 400
    c.post("/insurer/households/garcia/reach-out", headers=staff, json={"kind": "message", "note": "Can I visit at 10am?"})
    c.post("/households/garcia/messages", json={"text": "Yes, see you then"})
    thread = c.get("/insurer/households/garcia/outreach", headers=staff).json()["outreach"]
    assert [(m["kind"], m["note"]) for m in thread[-2:]] == [("message", "Can I visit at 10am?"), ("reply", "Yes, see you then")]
    assert "Hasn't answered outreach" not in c.get("/insurer/households/garcia", headers=staff).json()["reasons"]


def test_recovery_card_essentials_only_and_purchases_become_claim_proof(c):
    assert c.post("/households/garcia/card/activate").status_code == 400  # needs Bridge Funds first
    c.post("/households/garcia/claim/file")
    c.post("/households/garcia/bridge/disburse", json={"amount": 600})
    card = c.post("/households/garcia/card/activate").json()
    assert card["active"] and card["limit"] == 600
    ale0 = c.get("/households/garcia/claim").json()["owed"]["extra_living_expenses"]
    r = c.post("/households/garcia/card/purchase", json={"terminal_id": "hotel"}).json()
    assert r["approved"] and r["added_to_claim"] == 89 and r["bank_ref"]
    assert r["claim_extra_living"] == ale0 + 89
    tv = c.post("/households/garcia/card/purchase", json={"terminal_id": "tv"}).json()
    assert not tv["approved"] and "essential" in tv["reason"]
    gas = c.post("/households/garcia/card/purchase", json={"terminal_id": "gas"}).json()
    assert gas["approved"] and gas["added_to_claim"] == 0
    meal = c.post("/households/garcia/card/purchase", json={"terminal_id": "taqueria"}).json()
    assert meal["approved"] and meal["added_to_claim"] == 0 and "normal" in meal["reason"]  # under the weekly grocery budget
    big = c.post("/households/garcia/card/purchase", json={"merchant": "Hotel", "kind": "lodging", "amount": 590}).json()
    assert not big["approved"] and "left on the card" in big["reason"]


def test_messages_can_start_over(c):
    c.post("/insurer/households/garcia/reach-out", headers={"X-Staff": "Jordan"}, json={"kind": "message", "note": "Hi"})
    assert c.get("/households/garcia/messages").json()["messages"]
    c.delete("/households/garcia/messages")
    assert c.get("/households/garcia/messages").json()["messages"] == []
