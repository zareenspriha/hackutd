# Aftershock backend (FastAPI)

Runs fully offline: with no keys, Gemini, Nessie and MongoDB are replaced by local mocks (demo table items, in-memory DB).

```bash
cd backend
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
cp .env.example .env        # add keys when you have them
./.venv/bin/uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000/docs for every endpoint. `GET /` shows which pieces are live vs mock.
Run tests: `./.venv/bin/python -m pytest -q`. Reset the demo before each rehearsal: `POST /demo/reset`.

## Layout
- `app/engine/` all money math (pure Python, no AI): valuation, before/after compare, claim tracker, Bridge Funds, Disaster Mode, forecast, health indicators, Money Ladder, Next Steps, Recovery Priority
- `app/services/` Gemini (video/photo/receipt reading + wording), OpenCV checks, Nessie client, Recovery Coach
- `app/routers/` `prove.py` (State Farm), `fund.py` (Capital One), `navigate.py` (PNC), `insurer.py` (map)
- `app/data/synthetic.py` the Garcias, the Nguyens (similar loss, strong savings), 2,000 Dallas County households, ATMs

## Demo endpoints (household id `garcia`)
| Step | Call |
|---|---|
| Scan table before / after | `POST /households/garcia/scan` (form: `room=Office`, `phase=before\|after`, `video`) |
| Proof frames | `GET /households/garcia/frame?room=Office&phase=before&ts=4` |
| Family confirms losses | `POST /households/garcia/losses/review` `{"confirm_all_in_room":"Office"}` |
| Insurer map | `GET /insurer/households` |
| Home + Next Steps | `GET /households/garcia` |
| Bridge Funds | `GET /households/garcia/bridge`, `POST .../bridge/disburse` |
| Disaster Mode bills | `GET /households/garcia/bills` |
| Help Circle | `POST /households/garcia/help-circle` `{"from_name":"Ana","amount":200}` |
| Nearest working ATM | `GET /households/garcia/cash-access` |
| Coach | `POST /households/garcia/coach` `{"question":"Can I afford a hotel for two weeks?"}` |
| What-if slider | `GET /households/garcia/what-if?claim_delay_days=42&payout_pct=0.7&missed_work_days=10` |
| Receipt | `POST /households/garcia/receipt` (file `photo`) |
| Payout (repays Bridge Funds) | `POST /households/garcia/insurance-payout` |

## Notes
- The household document is the source of truth for balances. Money moves are mirrored to Nessie when `NESSIE_API_KEY` is set; a Nessie error never blocks the family.
- `GEMINI_MODEL` is configurable; default `gemini-3.6-flash`, falling back to `GEMINI_FALLBACK_MODELS` when a model is busy.
- Silence score (30 pts, `engine/priority.py`): no claim filed 15, days without contacting the insurer 2/day up to 10, unanswered outreach 5.
