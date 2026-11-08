# Aftershock: Final Plan

**What it is:** Aftershock helps families recover financially after a disaster. It proves what they lost, gets them every dollar they're owed, puts money in their hands before the claim pays, and guides every money decision until it does.

**Tracks:**
- Sponsors: State Farm, PNC, Capital One
- General: Design, Virality
- MLH: Gemini API, MongoDB Atlas, Vultr, GoDaddy Registry, DEV Writing Challenge

## The three pillars

| Pillar | Sponsor | Question it answers |
|---|---|---|
| Prove it | State Farm | What did I lose, what am I owed, and who needs help first? |
| Fund it | Capital One | How do I get money now, before the claim pays? |
| Navigate it | PNC | What do I have, where do I go, what do I do next, and can I afford this? |

---

## Pillar 1: Prove it (State Farm)

### Room Scanner
1. **Before a disaster:** the family records a 30-second video walking slowly around each room.
2. **After a disaster:** they record the same rooms again.
3. **Gemini Flash analyzes each video directly** and returns one item list per room: name, category, condition, estimated value range. If a video call fails, extract one frame per second and send those instead.
4. **Code calculates replacement cost and actual cash value** for every item. ACV uses a simple depreciation rule by category and age.
5. **Before vs. after comparison:** items matched by name, category, and room. Missing or damaged items go on the loss list with matching before and after frames.
6. **The family reviews and corrects** the list before it enters the Claim Tracker.

**Quality checks (OpenCV):** blur check asks them to slow down, brightness check asks for more light, and Gemini flags missing areas like "I didn't see the closet."

### Claim Tracker
Everything the family is owed, with proof attached:
- **Belongings:** the Room Scanner loss list.
- **Home damage:** photos read by Gemini, added as line items.
- **Extra living expenses:** receipts snapped by phone. Gemini reads them; code applies the rule that only costs **above normal spending** count, using Nessie purchase history. Example: a $210 week of restaurant meals for a family that normally spends $120 on groceries adds $90.
- **Status line:** "Owed to you: $8,420. Documented: 92%," plus what's still missing.

### Recovery Priority Map
The insurer's view after a disaster affects thousands of households. Ranks them by **financial urgency** to decide who gets adjuster outreach and Bridge Funds first (feeds into the Capital One banking side).

**Scoring (out of 100):**
- **Severity (40):** documented loss size.
- **Financial fragility (30):** from PNC's health indicators, opt-in only.
- **Silence (30):** _to be defined_ (no claim started, no app activity, no reply to outreach).

**Up, never down:** fragility only adds points. Responders see plain reasons like "Large contents loss, no claim started, 4 days of savings," never balances.

**At scale:** 2,000 synthetic households in Dallas County, ranked live on a map.

| State Farm asked for | We deliver |
|---|---|
| Identify those with the most urgent needs | Recovery Priority score |
| At scale | 2,000 households ranked live |
| Coordinate assistance | Ranking sets the order of adjuster outreach and Bridge Funds; Next Steps tells each family what to do |
| No one overlooked | Silence as a signal, up-never-down |
| AI and technology | Video inventory, before/after comparison, receipt and damage reading |
| Their feedback: focus on finances | Every feature is about money after the disaster |

---

## Pillar 2: Fund it (Capital One)

### Bridge Funds
A documented claim unlocks cash in minutes, repaid automatically when insurance pays.
- **Amount:** lesser of 40% of documented losses or 60 days of essential spending, capped at $5,000.
- **Unlocks when** the Claim Tracker shows documented proof: before/after frames, damage photos, or receipts.
- **Repayment:** automatic when the insurance deposit arrives.
- **Replaces** high-interest credit cards and payday loans.

### Disaster Mode
Turns on when the family reports a disaster or lives in an affected ZIP code.
- Flags every bill due before the claim pays, labeled: **pay now, move, or call about**.
- Pauses late fees in the simulation.
- Labels spending as essential (food, lodging, medicine) or can wait.

### Nessie endpoints

| Endpoint | Purpose |
|---|---|
| Customers and accounts | The whole financial picture |
| Purchases and merchants | Normal spending baseline and essentials labeling |
| Bills | Disaster Mode |
| Deposits | Bridge Funds and the insurance payout |
| Transfers (P2P) | Help Circle and Money Ladder moves |
| ATMs and branches | Cash Access |

| Capital One asked for | We deliver |
|---|---|
| Reimagine banking | A bank that knows a disaster happened and acts before the claim pays |
| Best use of Nessie | Six endpoint groups, each with a clear purpose |
| Improve financial lives | No payday loans, no late fees, no surprise bills |

---

## Pillar 3: Navigate it (PNC)

### Recovery Coach
A conversational coach, not a dashboard.

**One clear view of eight account types:** checking, savings, CD, IRA, credit card, auto loan, personal loan, mortgage. Nessie supplies checking, savings, and credit card; the rest live in the synthetic profile.

Answers PNC's questions:
- **"What do I have?"** Every account in plain language, plus what's coming in from insurance, Bridge Funds, and the Help Circle.
- **"Where do I go?"** The Money Ladder: which money to use first and which to protect.
- **"What do I do next?"** The Next Steps card (below), shown without being asked.
- **"Can I afford this?"** e.g. "Can I afford a hotel for two weeks?" or "Can I replace the car now?"

**Four health indicators:**
1. **Runway:** days until money runs out, counting everything coming in. Red under 14 days.
2. **Deductible coverage:** whether savings can cover the deductible.
3. **Bills at risk:** payments due before the claim pays.
4. **Debt pressure:** share of income going to debt payments, plus credit card usage vs. limit.

**Money Ladder (order money gets used):**
1. Bridge Funds and Help Circle money
2. Checking and savings
3. Ask the mortgage lender about a disaster payment pause
4. Credit card, only for essentials
5. Protect the CD until it matures
6. Protect the IRA (early withdrawal costs penalties and taxes)

**Forecast:** balance projected day by day until the claim pays, with the tight day marked.

**What-if simulator:**
- "What if my claim takes six weeks instead of three?"
- "What if insurance only pays 70%?"
- "What if I miss two weeks of work?"

Each updates the forecast, indicators, Money Ladder, **and Next Steps** live.

**Every answer shows its assumptions and ends with one next step.**

### Next Steps card (NEW)
The proactive answer to "what do I do now?" A card at the top of the family's home screen that always shows the **3 most important actions right now**, each with one tap to do it. It updates whenever anything changes (scan finished, receipt added, Bridge Funds landed, what-if moved). The family never has to ask the coach to know what to do.

**How it works:**
- **Rules engine in Python** (`next_steps.py`) checks the household state against a priority-ordered rule list and returns the top 3 that apply. Rules and amounts are code; Gemini only rewrites the `why` line in plain, warm language.
- Each step has: `id`, `title`, `why` (one sentence with the real number), `action` (route/button to the feature that does it), `priority`, `done`.
- Done steps drop off and the next one slides up.

**Rules (highest priority first):**

| # | Condition | Step shown | Button goes to |
|---|---|---|---|
| 1 | Disaster Mode on, no claim filed | "File your claim with State Farm today" | Claim Tracker → file |
| 2 | Damaged rooms not re-scanned | "Record the {room} again: it's still missing from your claim" | Room Scanner |
| 3 | Bridge Funds eligible, not taken | "Unlock ${amount} in Bridge Funds (repaid automatically when insurance pays)" | Bridge Funds |
| 4 | A bill due before claim pays labeled "pay now" | "Pay {bill} ${amt} by {date}" | Disaster Mode bill |
| 5 | Mortgage due before claim pays | "Call your lender about a disaster payment pause: saves ${1,450} this month" | Call script |
| 6 | Runway < 14 days | "Your money runs out on {date}. Ask your Help Circle for ${gap}" | Help Circle |
| 7 | Lodging/food spending above baseline, no receipts | "Snap your {merchant} receipts: about ${extra} of it counts toward your claim" | Receipt capture |
| 8 | Deductible not covered by savings | "Keep ${deductible} aside for your deductible; don't spend savings on can-wait items" | Coach |
| 9 | Documented < 100% | "Add {n} missing items to reach 100% documented" | Claim Tracker |
| 10 | Tempted to touch CD/IRA (forecast dips) | "Don't break your CD: it matures in {weeks} weeks" | Money Ladder |

**API:** `GET /households/{id}/next-steps` → `[{id, title, why, action, priority, done}]` (top 3). Recomputed on every state-changing call and on what-if changes (`?scenario=` param).

**Coach tie-in:** the "one next step" at the end of every coach answer is the top item from this list (or the most relevant one to the question), so the coach and the card never disagree.

**Insurer tie-in:** the Recovery Priority Map can show which households still have rule #1 or #2 open ("no claim started"), which feeds the silence signal.

**Garcia example (after the flood, before Bridge Funds):**
1. File your claim with State Farm today.
2. Unlock your Bridge Funds: repaid automatically when insurance pays.
3. Pay your car payment ($380) by Friday. Call about the phone bill.

After Bridge Funds land, #2 drops and "Call your lender about a mortgage pause" moves up.

| PNC asked for | We deliver |
|---|---|
| Whole picture across all account types | Eight account types in one view |
| Make sense of it | Plain-language answers |
| Confidence about the next move | Next Steps card + Money Ladder + one next step per answer |
| Conversational coach | Recovery Coach |
| 3+ health indicators | Four |
| Forecast balances and obligations | Day-by-day forecast |
| What-if simulator | Three live scenarios (also update Next Steps) |
| Something new | Disaster-aware: insurance and Bridge Funds counted as incoming money |

---

## How the pillars connect
1. The **Room Scanner** proves what the family owned.
2. After the disaster, the second scan, damage photos, and receipts fill the **Claim Tracker**.
3. **Recovery Priority** combines loss, silence, and PNC indicators to decide who gets help first.
4. The documented claim unlocks **Bridge Funds**, and **Disaster Mode** protects the account.
5. **Next Steps** tells the family exactly what to do at every moment, and the **Recovery Coach** answers every money question until the payout arrives and Bridge Funds repay themselves.

---

## Demo family: the Garcias

| Item | Value |
|---|---|
| Checking | $640 |
| Savings | $900 |
| CD | $5,000, matures in 5 weeks |
| IRA | $14,000 |
| Credit card | $2,100 balance, $3,000 limit |
| Auto loan | $380/month |
| Mortgage | $1,450/month |
| Insurance deductible | $2,500 |
| Normal grocery spending | $120/week |
| Expected claim timeline | 3 weeks |

---

## The 2.5-minute demo
**Demo items on the bench:** a laptop, a white box, and a Coke can (the same setup as our recorded videos).

**State Farm (50 sec)**
1. Record a video of the bench. The inventory appears with values.
2. "The flood hits." Take the laptop away.
3. Record again. The loss list shows the laptop as missing, with before and after frames and its value.
4. Switch to the insurer map. The Garcias jump to the top: "Large contents loss, no claim started, 6 days of savings." A neighbor with similar damage and strong savings ranks lower.

**Capital One (45 sec)**

5. Back on the Garcias' phone: the **Next Steps card** reads "File your claim / Unlock Bridge Funds / Pay car payment by Friday." Tap "Unlock Bridge Funds": the advance lands in their Nessie account, and the card updates.
6. Disaster Mode flags the car payment and phone bill due this week.
7. Their sister sends $200 through Help Circle. The nearest working ATM appears.

**PNC (50 sec)**

8. "Can I afford a hotel for two weeks?" The coach answers with the Money Ladder: use Bridge Funds first, protect the CD.
9. Drag the what-if to a six-week claim delay. The forecast marks the tight day, and **Next Steps** changes to "Call your lender about a mortgage pause."
10. Snap a restaurant receipt. "Only $90 counts, since you normally spend $120 a week on groceries." The Claim Tracker total rises.

**Close (5 sec):** "Prove it, fund it, navigate it. No one overlooked."

---

## Tech stack
- **Frontend:** Next.js + Tailwind, mobile-first for the family, desktop for the insurer map
- **Backend:** FastAPI (Python) on Vultr
- **AI:** Gemini Flash for video, photos, receipts, and the coach's / Next Steps' wording
- **Image checks:** OpenCV for blur and brightness
- **Banking:** Nessie API
- **Database:** MongoDB Atlas, geospatial queries for the map and nearby ATMs
- **Maps:** Leaflet + OpenStreetMap
- **Rule:** all scoring, valuations, forecasts, next-step rules, and money math live in Python. Gemini only reads images and writes explanations.

## Team roles
1. **Scan and CV:** video upload, OpenCV checks, Gemini item lists, before/after comparison, receipts and damage photos
2. **Banking backend:** Nessie integration, Bridge Funds, Disaster Mode, Help Circle, Cash Access
3. **PNC engine and coach:** health indicators, Money Ladder, forecast, what-ifs, **Next Steps rules engine**, Recovery Priority scoring, synthetic households
4. **Frontend, design, pitch:** family app (incl. **Next Steps card**), coach chat, insurer map, demo script, video, Devpost, DEV post

## Timeline
- **Hours 0–4:** video to item list working, Nessie seeded with the Garcias, synthetic households generated
- **Hours 4–10:** before/after comparison, Claim Tracker, Bridge Funds, Disaster Mode
- **Hours 10–16:** Recovery Coach, Money Ladder, forecast, what-ifs, **Next Steps engine + card**, Recovery Priority map
- **Hours 16–20:** receipts, Help Circle, Cash Access, design polish
- **Hours 20–24:** CV testing with demo items, video recording, five full rehearsals, Devpost, deploy to Vultr

## Fallbacks
- **Gemini video slow or fails:** switch to one frame per second.
- **Live upload fails during judging:** preloaded before/after videos of the same table.
- **A Nessie endpoint isn't available:** mock that piece locally and say so.
- **Item recognition errors:** the family review step lets you fix items live.
- **Gemini wording fails for Next Steps:** show the rule's template text as-is (it's already plain language).

## Honesty in the pitch
- Bridge Funds and Disaster Mode are **Nessie simulations** of what a bank and insurer could build together.
- Values are **estimates**; insurance details like extra living expenses and replacement cost vary by policy. Confirm the basics with State Farm at their booth.
- The financial signals in the map are **opt-in**, shown as reasons instead of balances, and only move people up.

## Submission checklist
- Devpost: select State Farm, PNC, Capital One, Design, Virality, and all five MLH tracks
- Public GitHub repo with a README and architecture diagram
- Demo video under 2 minutes
- Register an "aftershock" domain with GoDaddy code MLHUTD84 (first available name)
- Backend live on Vultr
- Post the demo video on social for Virality
- Publish the DEV post after submission

## The close
"After a disaster, families lose more than their home. They lose what they can't prove, what they never claim, and what they waste while waiting. Aftershock proves it, funds it, and navigates it, so no one is overlooked."
