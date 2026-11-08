// Thin client for the FastAPI backend. Every call falls back to mock data,
// so the UI keeps working if the backend is down (also our demo fallback).
// The backend speaks snake_case; the to*() functions below convert to the shapes in ./types.
import { garciaNextSteps, garcias, scannedItems, syntheticHouseholds, tierOf } from "./mock";
import type { Account, Bill, ClaimLine, Household, Item, NextStep, PriorityHousehold } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL; // e.g. http://<vultr-ip>:8000

async function get<T>(path: string, fallback: T): Promise<T> {
  if (!BASE) return fallback;
  try {
    const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

async function post<T>(path: string, body: unknown, fallback: T): Promise<T> {
  if (!BASE) return fallback;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

// ---------- backend response shapes (only the fields we use) ----------

type ApiNextStep = { id: string; title: string; why: string; action: string; priority: number; done: boolean };
type ApiHome = {
  id: string; name: string; disaster_mode: boolean; claim_filed: boolean; expected_days_to_pay: number;
  deductible: number; weekly_grocery_spend: number; next_steps: ApiNextStep[];
};
type ApiAccount = { key: Account["type"]; type: string; amount: number; limit?: number; monthly_payment?: number; matures_in_weeks?: number };
type ApiBill = { id: string; payee: string; amount: number; due_in_days: number; label: "pay_now" | "move" | "call_about" | null };
type ApiHealth = { runway: { value: number }; deductible: { value: number }; bills_at_risk: { value: number }; debt_pressure: { value: number } };
type ApiClaim = {
  filed: boolean;
  losses: { name: string; room: string; replacement_cost: number; confirmed: boolean }[];
  damage: { description: string; estimated_cost: number }[];
  receipts: { merchant: string; countable: number }[];
};
type ApiBridge = { eligible: boolean; amount: number; disbursed: boolean };
type ApiItem = {
  id: string; room: string; name: string; category: string; condition: Item["condition"];
  replacement_cost: number; actual_cash_value: number; before_frame_ts: number | null; after_frame_ts: number | null; has_video: boolean;
};
type ApiPriority = {
  id: string; name: string; lat: number; lng: number; zip: string; score: number;
  severity: number; fragility: number; silence: number; reasons: string[]; synthetic: boolean;
};

// ---------- converters ----------

/** Backend actions are API routes; the app navigates by scene id. */
function toScene(action: string): string {
  if (action.startsWith("/claim/review")) return "compare";
  if (action.startsWith("/claim") || action.startsWith("/receipts")) return "claim";
  if (action.startsWith("/scan")) return "scan";
  if (action.startsWith("/bridge")) return "fund";
  if (action.startsWith("/bills")) return "bills";
  if (action.startsWith("/help-circle")) return "circle";
  if (action.startsWith("/ladder")) return "picture";
  return "ask"; // /coach, call scripts
}

const toNextStep = (s: ApiNextStep): NextStep => ({ ...s, action: toScene(s.action) });

const toAccount = (a: ApiAccount): Account => ({
  id: a.key,
  type: a.key,
  label: a.type,
  balance: a.amount,
  limit: a.limit,
  monthlyPayment: a.monthly_payment,
  maturesInWeeks: a.matures_in_weeks,
});

function toBill(b: ApiBill): Bill | null {
  if (!b.label) return null; // due after the claim pays: nothing to decide yet
  const due = new Date(Date.now() + b.due_in_days * 86_400_000).toISOString().slice(0, 10);
  return { id: b.id, name: b.payee, amount: b.amount, due, label: b.label === "call_about" ? "call" : b.label };
}

function toClaimLines(c: ApiClaim): ClaimLine[] {
  return [
    ...c.losses.map((l, i) => ({ id: `loss${i}`, kind: "belongings" as const, label: `${l.name} (${l.room})`, amount: l.replacement_cost, documented: l.confirmed })),
    ...c.damage.map((d, i) => ({ id: `damage${i}`, kind: "home_damage" as const, label: d.description, amount: d.estimated_cost, documented: true })),
    ...c.receipts.map((r, i) => ({ id: `receipt${i}`, kind: "living_expense" as const, label: r.merchant, amount: r.countable, documented: true })),
  ];
}

const frameUrl = (id: string, room: string, phase: "before" | "after", ts: number | null) =>
  ts == null ? undefined : `${BASE}/households/${id}/frame?room=${encodeURIComponent(room)}&phase=${phase}&ts=${ts}`;

const toItem = (householdId: string) => (i: ApiItem): Item => ({
  id: i.id,
  room: i.room,
  name: i.name,
  category: i.category,
  condition: i.condition,
  replacementCost: i.replacement_cost,
  acv: i.actual_cash_value,
  beforeFrame: i.has_video ? frameUrl(householdId, i.room, "before", i.before_frame_ts) : undefined,
  afterFrame: i.has_video ? frameUrl(householdId, i.room, "after", i.after_frame_ts) : undefined,
});

const toPriority = (p: ApiPriority): PriorityHousehold => ({
  id: p.id,
  name: p.name,
  lat: p.lat,
  lng: p.lng,
  zip: p.zip,
  score: p.score,
  severity: p.severity,
  fragility: p.fragility,
  silence: p.silence,
  reasons: p.reasons,
  isDemo: !p.synthetic,
  tier: tierOf(p.score),
});

/** What-if inputs for next steps; matches the backend query params. */
export type Scenario = { claimDelayDays?: number; payoutPct?: number; missedWorkDays?: number };

function scenarioQuery(s?: Scenario): string {
  if (!s) return "";
  const q = new URLSearchParams();
  if (s.claimDelayDays != null) q.set("claim_delay_days", String(s.claimDelayDays));
  if (s.payoutPct != null) q.set("payout_pct", String(s.payoutPct));
  if (s.missedWorkDays != null) q.set("missed_work_days", String(s.missedWorkDays));
  const str = q.toString();
  return str ? `?${str}` : "";
}

// ---------- API ----------

export const api = {
  /** Full household picture, assembled from the backend's per-screen endpoints. */
  household: async (id = "garcia"): Promise<Household> => {
    if (!BASE) return garcias;
    const [home, accounts, bills, health, claim, bridge] = await Promise.all([
      get<ApiHome | null>(`/households/${id}`, null),
      get<{ accounts: ApiAccount[] } | null>(`/households/${id}/accounts`, null),
      get<{ bills: ApiBill[] } | null>(`/households/${id}/bills`, null),
      get<ApiHealth | null>(`/households/${id}/health`, null),
      get<ApiClaim | null>(`/households/${id}/claim`, null),
      get<ApiBridge | null>(`/households/${id}/bridge`, null),
    ]);
    if (!home || !accounts || !bills || !health || !claim || !bridge) return garcias;
    return {
      id: home.id,
      name: home.name,
      disasterMode: home.disaster_mode,
      claimFiled: home.claim_filed,
      accounts: accounts.accounts.map(toAccount),
      deductible: home.deductible,
      weeklyGroceryBaseline: home.weekly_grocery_spend,
      expectedClaimWeeks: Math.round(home.expected_days_to_pay / 7),
      claim: toClaimLines(claim),
      bills: bills.bills.map(toBill).filter((b): b is Bill => b !== null),
      health: {
        runwayDays: health.runway.value,
        deductibleCovered: health.deductible.value >= 100,
        billsAtRisk: health.bills_at_risk.value,
        debtPressurePct: health.debt_pressure.value,
      },
      bridgeFunds: {
        eligible: bridge.eligible || bridge.disbursed ? bridge.amount : 0,
        taken: bridge.disbursed ? bridge.amount : 0,
      },
    };
  },

  nextSteps: async (id = "garcia", scenario?: Scenario): Promise<NextStep[]> => {
    const r = await get<{ next_steps: ApiNextStep[] } | null>(`/households/${id}/next-steps${scenarioQuery(scenario)}`, null);
    return r ? r.next_steps.map(toNextStep) : garciaNextSteps;
  },

  items: async (id = "garcia"): Promise<Item[]> => {
    const r = await get<{ items: ApiItem[] } | null>(`/households/${id}/items`, null);
    return r && r.items.length ? r.items.map(toItem(id)) : scannedItems;
  },

  priority: async (): Promise<PriorityHousehold[]> => {
    const r = await get<{ households: ApiPriority[] } | null>(`/insurer/households`, null);
    return r ? r.households.map(toPriority) : syntheticHouseholds();
  },

  unlockBridgeFunds: async (id = "garcia"): Promise<{ amount: number }> => {
    const r = await post<{ amount: number } | null>(`/households/${id}/bridge/disburse`, {}, null);
    return r ? { amount: r.amount } : { amount: garcias.bridgeFunds.eligible };
  },

  coach: async (id: string, message: string): Promise<{ answer: string; nextStep?: string }> => {
    const r = await post<{ answer: string; next_step?: { title: string } | null } | null>(
      `/households/${id}/coach`,
      { question: message },
      null,
    );
    if (r) return { answer: r.answer, nextStep: r.next_step?.title };
    return {
      answer:
        "Yes, if you use Bridge Funds first. Two weeks at $89/night is $1,246. Bridge Funds cover it and leave $1,234. Keep your CD untouched, it matures in 5 weeks.",
      nextStep: "Unlock your Bridge Funds",
    };
  },
};
