# looma.

your calm after the storm. looma helps families recover financially after a disaster: prove what they lost, get money before the claim pays, and know exactly what to do next.

## Run it

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 on a laptop. Press Enter to begin, then use ← → to move through the story (great for demos). Deep links work too: `/#scan`, `/#fund`, `/#lantern`.

## Structure

- **Landing site** (`scenes/Title.tsx`): light page with thin grid lines, animated logo, nav dropdowns with live illustrations, and a phone mockup playing a Bridge Funds moment. Press Enter or "open looma".
- **The app** (`LoomaApp.tsx`): dark shell with a glass sidebar and one focused page at a time in the content pane.
  - today · one thing to do now (`Today.tsx`)
  - prove it · scan a room (`Scan.tsx`), what changed (`Compare.tsx`), my claim (`Claim.tsx`)
  - fund it · bridge funds (`Fund.tsx`: numpad → swipe → card reveal), bills (`Bills.tsx`: one bill at a time), help circle (`Circle.tsx`)
  - navigate it · ask looma (`Ask.tsx`), my money (`Picture.tsx`: one question per tab), what if (`Wait.tsx`)
- **Responder view** (`Lantern.tsx`): dark console for insurers.

Steps completed anywhere check off on the today page. ← → walks the app in order. **Shift+D** opens demo controls.

## Design system

- Palette: midnight `#1C2E4A`, dusty blue `#52677D`, ivory `#BDC4D4`, deep navy `#0F1A2B`, buttercream `#D1CFC9`.
- Type: Outfit (light for headlines), all lowercase headlines.
- Utilities in `globals.css`: `glass`, `pill-dark`, `pill-light`, `eyebrow`, `headline`.
- Mascot: `components/Logo.tsx` (wordmark, drawn as geometry so the o's are true rings) and `components/Cat.tsx` (avatar + `LoomaSays`).
- No company names anywhere in the UI.

## Code map

- `src/lib/types.ts`: shared data shapes (backend models should match).
- `src/lib/mock.ts`: Garcia data, forecast model, synthetic households.
- `src/lib/api.ts`: API client; every call falls back to mock data (also the live-demo fallback).

## API the frontend expects

- `GET /households/{id}` → Household
- `GET /households/{id}/next-steps?scenario=` → NextStep[] (top 3)
- `GET /households/{id}/items` → Item[]
- `POST /households/{id}/bridge-funds` → `{ amount }`
- `POST /households/{id}/coach` `{ message }` → `{ answer, nextStep }`
- `GET /priority` → PriorityHousehold[]
