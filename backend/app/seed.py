"""Seed the store (and Nessie, if a key is set) with the Garcias, the neighbor, 2,000 households and ATMs."""
import logging

from .config import get_settings
from .data.synthetic import garcia, garcia_purchases, neighbor, synthetic_atms, synthetic_households
from .services.nessie import get_nessie
from .store import get_store

log = logging.getLogger("looma.seed")


async def seed(force: bool = False) -> dict:
    store = get_store()
    if not force and await store.count() > 0:
        return {"seeded": False, "households": await store.count()}
    await store.clear()
    g = garcia()
    nessie = get_nessie()
    if not nessie.mock:
        try:
            g = await nessie.seed_household(g, garcia_purchases())
            log.info("Seeded the Garcias in Nessie: customer %s", g.nessie_customer_id)
        except Exception as e:  # noqa: BLE001
            log.warning("Nessie seeding failed, continuing with local data only: %s", e)
    n = get_settings().synthetic_household_count
    await store.save_many([g, neighbor(), *synthetic_households(n)])
    await store.save_atms(synthetic_atms())
    return {"seeded": True, "households": await store.count()}
