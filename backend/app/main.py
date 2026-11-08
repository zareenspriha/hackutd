"""Aftershock API. Run: uvicorn app.main:app --reload (from backend/)."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .engine.claim import claim_summary
from .engine.next_steps import compute_next_steps
from .routers import fund, insurer, navigate, prove
from .routers.deps import load
from .seed import seed

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    await seed()
    yield


app = FastAPI(title="Aftershock API", version="0.1.0", lifespan=lifespan,
              description="Prove it (State Farm), fund it (Capital One), navigate it (PNC).")

_origins = [o.strip() for o in get_settings().cors_origins.split(",")]
app.add_middleware(CORSMiddleware, allow_origins=_origins, allow_methods=["*"], allow_headers=["*"])

app.include_router(prove.router)
app.include_router(fund.router)
app.include_router(navigate.router)
app.include_router(insurer.router)


@app.get("/", tags=["meta"])
async def root():
    s = get_settings()
    return {
        "name": "Aftershock API",
        "docs": "/docs",
        "modes": {
            "gemini": "mock" if s.use_mock_gemini else s.gemini_model,
            "nessie": "mock" if s.use_mock_nessie else "live",
            "database": "memory" if s.use_memory_db else "mongodb",
        },
    }


@app.get("/households/{household_id}", tags=["family home"])
async def household_home(household_id: str):
    """Family home screen: name, Disaster Mode, claim status line, Next Steps."""
    h = await load(household_id)
    c = claim_summary(h)
    return {
        "id": h.id, "name": h.name, "disaster_mode": h.disaster_mode,
        "claim_status": c["status_line"], "documented_pct": c["documented_pct"], "owed": c["owed"]["total"],
        "checking": h.accounts.checking, "savings": h.accounts.savings,
        "bridge": h.bridge.model_dump(), "next_steps": compute_next_steps(h),
    }


@app.post("/demo/reset", tags=["meta"])
async def demo_reset():
    """Reset everything to the starting demo state (run before each rehearsal)."""
    return await seed(force=True)
