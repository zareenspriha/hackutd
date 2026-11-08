"""Pillar 3 (PNC): Recovery Coach, health indicators, Money Ladder, forecast, what-ifs, Next Steps."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..engine.forecast import run_forecast
from ..engine.health import indicators
from ..engine.ladder import money_ladder
from ..engine.next_steps import compute_next_steps
from ..models import Scenario
from ..services.coach import _accounts_view, ask
from ..services.gemini import get_gemini
from .deps import load, scenario

router = APIRouter(prefix="/households/{household_id}", tags=["navigate (PNC)"])


@router.get("/accounts")
async def accounts(household_id: str):
    """All eight account types in plain language."""
    return {"accounts": _accounts_view(await load(household_id))}


@router.get("/health")
async def health(household_id: str, s: Scenario = Depends(scenario)):
    return indicators(await load(household_id), s)


@router.get("/forecast")
async def forecast(household_id: str, s: Scenario = Depends(scenario)):
    return run_forecast(await load(household_id), s)


@router.get("/ladder")
async def ladder(household_id: str, s: Scenario = Depends(scenario)):
    return {"ladder": money_ladder(await load(household_id), s)}


@router.get("/next-steps")
async def next_steps(household_id: str, s: Scenario = Depends(scenario), polish: bool = False):
    """Top 3 actions right now. `polish=true` lets Gemini reword the `why` lines (numbers unchanged)."""
    steps = compute_next_steps(await load(household_id), s)
    if polish:
        g = get_gemini()
        for st in steps:
            st["why"] = await g.write("Reword this one line for a family after a disaster.", {"line": st["why"]}, st["why"])
    return {"next_steps": steps}


@router.get("/what-if")
async def what_if(household_id: str, s: Scenario = Depends(scenario)):
    """Everything the what-if slider updates, in one call: forecast, indicators, ladder, next steps."""
    h = await load(household_id)
    fc = run_forecast(h, s)
    base = run_forecast(h, Scenario())
    return {
        "scenario": s.model_dump(),
        "forecast": fc,
        "baseline": {k: base[k] for k in ("payout_day", "tight_day", "min_balance_before_payout", "runway_days")},
        "indicators": indicators(h, s, fc),
        "ladder": money_ladder(h, s, fc),
        "next_steps": compute_next_steps(h, s, fc),
    }


class Question(BaseModel):
    question: str = Field(min_length=1, max_length=500)


@router.post("/coach")
async def coach(household_id: str, body: Question, s: Scenario = Depends(scenario)):
    return await ask(await load(household_id), body.question, s)


@router.get("/coach/call-script/mortgage")
async def mortgage_script(household_id: str):
    h = await load(household_id)
    return {"script": [
        "Hi, I'm calling about my mortgage. My home was damaged in the recent disaster.",
        f"My monthly payment is ${h.accounts.mortgage_monthly:,.0f}. I've filed an insurance claim and expect a payout in about "
        f"{h.claim.expected_days_to_pay // 7} weeks.",
        "Do you offer a disaster forbearance or payment pause? Will it be reported to the credit bureaus?",
        "Can you waive late fees during the pause, and what happens to the paused payments afterward?",
    ]}
