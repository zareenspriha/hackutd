// Demo data so every screen works before the backend is live.
// The Garcias match the numbers in the Final Plan.
import type { ForecastPoint, Household, Item, NextStep, PriorityHousehold } from "./types";

export const garcias: Household = {
  id: "garcia",
  name: "The Garcias",
  disasterMode: true,
  claimFiled: false,
  deductible: 2500,
  weeklyGroceryBaseline: 120,
  expectedClaimWeeks: 3,
  accounts: [
    { id: "chk", type: "checking", label: "Checking", balance: 640 },
    { id: "sav", type: "savings", label: "Savings", balance: 900 },
    { id: "cd", type: "cd", label: "CD", balance: 5000, maturesInWeeks: 5 },
    { id: "ira", type: "ira", label: "IRA", balance: 14000 },
    { id: "cc", type: "credit_card", label: "Credit card", balance: 2100, limit: 3000 },
    { id: "auto", type: "auto_loan", label: "Auto loan", balance: 11200, monthlyPayment: 380 },
    { id: "mort", type: "mortgage", label: "Mortgage", balance: 186000, monthlyPayment: 1450 },
  ],
  claim: [
    { id: "c1", kind: "belongings", label: "Living room: 4 items", amount: 2430, documented: true },
    { id: "c6", kind: "belongings", label: "Living room after scan: 3 items", amount: 690, documented: true },
    { id: "c2", kind: "belongings", label: "Bedroom: 3 items", amount: 1980, documented: true },
    { id: "c3", kind: "home_damage", label: "Flooring, living room", amount: 2556, documented: true },
    { id: "c4", kind: "living_expense", label: "Restaurant meals (above baseline)", amount: 90, documented: true },
    { id: "c5", kind: "belongings", label: "Closet: not scanned yet", amount: 674, documented: false },
  ],
  bills: [
    { id: "b1", name: "Car payment", amount: 380, due: "2026-11-13", label: "pay_now" },
    { id: "b2", name: "Phone bill", amount: 95, due: "2026-11-14", label: "call" },
    { id: "b3", name: "Mortgage", amount: 1450, due: "2026-12-01", label: "call" },
    { id: "b4", name: "Streaming", amount: 18, due: "2026-11-20", label: "move" },
  ],
  health: { runwayDays: 4, deductibleCovered: false, billsAtRisk: 3, debtPressurePct: 34 },
  bridgeFunds: { eligible: 2480, taken: 0 },
};

export const garciaNextSteps: NextStep[] = [
  {
    id: "file_claim",
    title: "File your claim today",
    why: "Your loss list is ready: $8,420 owed, 92% documented.",
    action: "claim",
    priority: 1,
    done: false,
  },
  {
    id: "bridge_funds",
    title: "Unlock $2,480 in Bridge Funds",
    why: "Repaid automatically when your insurance pays, so no payday loan needed.",
    action: "fund",
    priority: 3,
    done: false,
  },
  {
    id: "pay_car",
    title: "Pay your car payment ($380) by Friday",
    why: "It's the one bill due before your claim pays that can't wait. Call about the phone bill.",
    action: "fund",
    priority: 4,
    done: false,
  },
];

export const scannedItems: Item[] = [
  { id: "i1", room: "Living room", name: "Laptop", category: "Electronics", condition: "good", replacementCost: 1100, acv: 770 },
  { id: "i2", room: "Living room", name: "Headphones", category: "Electronics", condition: "missing", replacementCost: 250, acv: 175 },
  { id: "i3", room: "Living room", name: "Backpack", category: "Accessories", condition: "good", replacementCost: 80, acv: 56 },
  { id: "i4", room: "Living room", name: "Desk lamp", category: "Furniture", condition: "good", replacementCost: 45, acv: 36 },
  { id: "i5", room: "Living room", name: "Water bottle", category: "Kitchen", condition: "good", replacementCost: 30, acv: 21 },
  { id: "i6", room: "Living room", name: "Small appliance (boxed)", category: "Appliances", condition: "damaged", replacementCost: 180, acv: 126 },
];

/** Day-by-day checking+savings projection until the claim pays. */
export function forecast(claimWeeks = 3, payoutPct = 1, missedWorkWeeks = 0, bridge = 0): ForecastPoint[] {
  const days = claimWeeks * 7 + 7;
  const pts: ForecastPoint[] = [];
  let bal = 640 + 900 + bridge;
  for (let d = 0; d <= days; d++) {
    if (d > 0) {
      bal -= 95; // essentials while displaced (food, gas, basics)
      if (d <= 14) bal -= 89; // two weeks of hotel
      if (d === 5 || d === 35) bal -= 380; // car
      if (d === 6 || d === 36) bal -= 95; // phone
      if (d === 23 || d === 53) bal -= 1450; // mortgage
      if (d % 14 === 0) {
        // biweekly paycheck; missed weeks come out of the earliest checks first
        const n = d / 14;
        const lost = Math.min(2, Math.max(0, missedWorkWeeks - (n - 1) * 2));
        bal += 1650 * (1 - lost / 2);
      }
      if (d === claimWeeks * 7) bal += Math.round(8420 * payoutPct) - 2500 - bridge;
    }
    pts.push({ day: d, balance: Math.round(bal) });
  }
  return pts;
}

// Deterministic synthetic households across Dallas County.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const ZIPS = ["75201", "75204", "75206", "75214", "75218", "75228", "75231", "75243", "75248", "75252", "75287", "75038", "75040", "75041", "75060", "75061", "75149", "75150", "75180", "75116"];
const NAMES = ["Nguyen", "Johnson", "Patel", "Martinez", "Williams", "Brown", "Lee", "Davis", "Hernandez", "Okafor", "Smith", "Kim", "Lopez", "Wilson", "Moore", "Taylor", "Clark", "Rivera", "Walker", "Young"];
export const tierOf = (score: number) => (score >= 70 ? "urgent" : score >= 52 ? "high" : score >= 35 ? "medium" : "low") as "urgent" | "high" | "medium" | "low";

export function syntheticHouseholds(n = 2000): PriorityHousehold[] {
  const r = rng(42);
  const out: PriorityHousehold[] = [];
  for (let i = 0; i < n; i++) {
    const severity = Math.round(r() * 40);
    const fragility = Math.round(r() * r() * 30);
    const silence = r() > 0.7 ? Math.round(10 + r() * 20) : Math.round(r() * 8);
    const reasons: string[] = [];
    if (severity > 28) reasons.push("Large contents loss");
    if (silence > 15) reasons.push("No claim started");
    if (fragility > 18) reasons.push(`${Math.max(2, Math.round(14 - fragility / 3))} days of savings`);
    out.push({
      id: `hh-${i}`,
      lat: 32.62 + r() * 0.36,
      lng: -97.0 + r() * 0.5,
      severity,
      fragility,
      silence,
      score: severity + fragility + silence,
      reasons: reasons.length ? reasons : ["Claim in progress"],
      zip: ZIPS[Math.floor(r() * ZIPS.length)],
      name: `${NAMES[Math.floor(r() * NAMES.length)]} household`,
    });
  }
  out.push({
    id: "garcia",
    lat: 32.86,
    lng: -96.77,
    severity: 34,
    fragility: 28,
    silence: 28,
    score: 90,
    reasons: ["Large contents loss", "No claim started", "4 days of savings"],
    isDemo: true,
    zip: "75252",
    name: "Garcia household",
  });
  return out.map((h) => ({ ...h, tier: tierOf(h.score) })).sort((a, b) => b.score - a.score);
}
