"use client";
/**
 * Live data from the FastAPI backend, shared by every scene.
 * `live.data` is null when NEXT_PUBLIC_API_URL is unset or the backend is down; scenes then use mock data.
 * Every action posts to the backend and then refreshes, so all scenes stay in sync.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export const API = process.env.NEXT_PUBLIC_API_URL;
export const HOUSEHOLD = "garcia";

// ---------- backend shapes (snake_case, only fields the UI reads) ----------

export type LNextStep = { id: string; title: string; why: string; action: string; priority: number; done: boolean };
export type LHome = {
  id: string; name: string; disaster_mode: boolean; claim_filed: boolean; expected_days_to_pay: number;
  deductible: number; weekly_grocery_spend: number; checking: number; savings: number; owed: number;
  bridge: { amount: number; disbursed: boolean; repaid: boolean }; next_steps: LNextStep[];
  help_circle: LHelp[]; mortgage_pause_requested: boolean; lat: number; lng: number;
};
export type LAccount = { key: string; type: string; amount: number; text: string; limit?: number; monthly_payment?: number; matures_in_weeks?: number };
export type LBill = {
  id: string; payee: string; amount: number; due_in_days: number; kind: string; essential: boolean;
  status: "pending" | "paid" | "moved"; label: "pay_now" | "move" | "call_about" | null; label_text: string;
};
export type LIndicator = { name: string; value: number; status: "red" | "yellow" | "green"; text: string };
export type LHealth = { runway: LIndicator; deductible: LIndicator; bills_at_risk: LIndicator; debt_pressure: LIndicator };
export type LRung = { rank: number; key: string; name: string; action: "use" | "ask" | "essentials_only" | "protect"; available: number; text: string };
export type LLoss = { name: string; category: string; room: string; status: string; replacement_cost: number; actual_cash_value: number; confirmed: boolean };
export type LReceipt = { merchant: string; category: string; total: number; days_covered: number; countable: number; explanation: string };
export type LClaim = {
  owed: { total: number; belongings: number; home_damage: number; extra_living_expenses: number };
  documented: number; documented_pct: number; status_line: string; missing: string[]; filed: boolean;
  expected_days_to_pay: number; losses: LLoss[]; damage: { description: string; area: string; estimated_cost: number }[]; receipts: LReceipt[];
};
export type LBridge = {
  eligible: boolean; amount: number; limit: number; drawn: number; remaining: number; disbursed: boolean; repaid: boolean; reason: string; documented_losses: number;
  limits: { forty_pct_of_losses: number; sixty_days_essentials: number; cap: number };
};
export type LDay = { day: number; balance: number; events: { label: string; amount: number }[] };
export type LForecast = {
  days: LDay[]; payout_day: number; expected_payout: number; bridge_repayment: number; tight_day: number;
  min_balance_before_payout: number; runway_days: number | null; horizon: number; assumptions: string[];
};
export type LAtm = { id: string; name: string; lat: number; lng: number; working: boolean; hours: string; distance_km: number };
export type LCash = { nearest_working: LAtm | null; working: LAtm[]; out_of_service: LAtm[] };
export type LPriority = {
  id: string; name: string; rank: number; lat: number; lng: number; zip: string; score: number;
  severity: number; fragility: number; silence: number; reasons: string[]; claim_filed: boolean; synthetic: boolean;
};
export type LScanItem = { name: string; category: string; room: string; condition: string; replacement_cost: number; actual_cash_value: number; frame_ts: number | null };
export type LScanResult = {
  room: string; phase: "before" | "after"; analysis_method: string; items: LScanItem[]; inventory_total: number;
  missing_areas: string[]; quality: { ok: boolean; warnings: string[] }; losses: LLoss[]; loss_total: number;
};
export type LHelp = { from_name: string; amount: number; note: string };
export type LCard =
  | { kind: "ladder"; rows: { label: string; amount: string; use: boolean }[] }
  | { kind: "when"; now: string; later: string; date: string }
  | { kind: "simulate" }
  | { kind: "picture" };
export type LCoach = { intent: string; answer: string; card: LCard | null; next_step: LNextStep | null; assumptions: string[] };

export type LiveData = {
  home: LHome; accounts: LAccount[]; bills: LBill[]; health: LHealth; ladder: LRung[]; claim: LClaim;
  bridge: LBridge; forecast: LForecast; cash: LCash; priority: LPriority[];
};

export type Scenario = { claimDelayDays?: number; payoutPct?: number; missedWorkDays?: number; mortgagePause?: boolean };

// ---------- http ----------

async function req<T>(method: "GET" | "POST", path: string, body?: unknown, form?: FormData): Promise<T> {
  if (!API) throw new Error("No API configured");
  const res = await fetch(`${API}${path}`, {
    method,
    cache: "no-store",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  if (!res.ok) {
    const detail = await res.json().then((j) => j.detail).catch(() => res.statusText);
    throw new Error(typeof detail === "string" ? detail : `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

const hh = (p = "") => `/households/${HOUSEHOLD}${p}`;

export function scenarioQuery(s?: Scenario): string {
  if (!s) return "";
  const q = new URLSearchParams();
  if (s.claimDelayDays != null) q.set("claim_delay_days", String(s.claimDelayDays));
  if (s.payoutPct != null) q.set("payout_pct", String(s.payoutPct));
  if (s.missedWorkDays) q.set("missed_work_days", String(s.missedWorkDays));
  if (s.mortgagePause) q.set("mortgage_pause", "true");
  const str = q.toString();
  return str ? `?${str}` : "";
}

async function loadAll(): Promise<LiveData> {
  const [home, accounts, bills, health, ladder, claim, bridge, forecast, cash, priority] = await Promise.all([
    req<LHome>("GET", hh()),
    req<{ accounts: LAccount[] }>("GET", hh("/accounts")),
    req<{ bills: LBill[] }>("GET", hh("/bills")),
    req<LHealth>("GET", hh("/health")),
    req<{ ladder: LRung[] }>("GET", hh("/ladder")),
    req<LClaim>("GET", hh("/claim")),
    req<LBridge>("GET", hh("/bridge")),
    req<LForecast>("GET", hh("/forecast")),
    req<LCash>("GET", hh("/cash-access")),
    req<{ households: LPriority[] }>("GET", "/insurer/households?limit=2002"),
  ]);
  return {
    home, accounts: accounts.accounts, bills: bills.bills, health, ladder: ladder.ladder, claim, bridge, forecast, cash,
    priority: priority.households,
  };
}

// ---------- context ----------

type Live = {
  data: LiveData | null;
  /** true while the first load is running */
  loading: boolean;
  refresh: () => Promise<void>;
  forecast: (s: Scenario) => Promise<LForecast | null>;
  coach: (question: string) => Promise<LCoach | null>;
  whatIf: (s: Scenario) => Promise<{ forecast: LForecast; next_steps: LNextStep[] } | null>;
  fileClaim: () => Promise<void>;
  addReceipt: (r: { merchant: string; category: "food" | "lodging" | "transport" | "other"; total: number; days_covered: number }) => Promise<LReceipt | null>;
  takeBridge: (amount?: number) => Promise<number | null>;
  helpCircle: (fromName: string, amount: number) => Promise<void>;
  mortgagePause: () => Promise<void>;
  billAction: (billId: string, action: "pay" | "move") => Promise<void>;
  confirmRoom: (room: string) => Promise<void>;
  scan: (room: string, phase: "before" | "after", video: File) => Promise<LScanResult>;
  reset: () => Promise<void>;
};

const LiveCtx = createContext<Live>(null as unknown as Live);
export const useLive = () => useContext(LiveCtx);

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(!!API);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    if (!API) return;
    const n = ++seq.current;
    try {
      const d = await loadAll();
      if (n === seq.current) setData(d);
    } catch {
      if (n === seq.current) setData(null); // backend down: scenes fall back to mock data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Run a backend action, then refresh. Failures are swallowed so the demo never breaks. */
  const act = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      if (!API) return null;
      try {
        const r = await fn();
        await refresh();
        return r;
      } catch {
        return null;
      }
    },
    [refresh],
  );

  const value: Live = {
    data,
    loading,
    refresh,
    forecast: async (s) => {
      if (!API) return null;
      try {
        return await req<LForecast>("GET", hh(`/forecast${scenarioQuery(s)}`));
      } catch {
        return null;
      }
    },
    whatIf: async (s) => {
      if (!API) return null;
      try {
        return await req("GET", hh(`/what-if${scenarioQuery(s)}`));
      } catch {
        return null;
      }
    },
    coach: async (question) => {
      if (!API) return null;
      try {
        return await req("POST", hh("/coach"), { question });
      } catch {
        return null;
      }
    },
    fileClaim: async () => void (await act(() => req("POST", hh("/claim/file")))),
    addReceipt: async (r) => (await act(() => req<{ receipt: LReceipt }>("POST", hh("/receipt/manual"), r)))?.receipt ?? null,
    takeBridge: async (amount) => (await act(() => req<{ amount: number }>("POST", hh("/bridge/disburse"), amount ? { amount } : {})))?.amount ?? null,
    helpCircle: async (fromName, amount) => void (await act(() => req("POST", hh("/help-circle"), { from_name: fromName, amount }))),
    mortgagePause: async () => void (await act(() => req("POST", hh("/mortgage-pause")))),
    billAction: async (billId, action) => void (await act(() => req("POST", hh(`/bills/${billId}`), { action }))),
    confirmRoom: async (room) => void (await act(() => req("POST", hh("/losses/review"), { confirm_all_in_room: room }))),
    scan: async (room, phase, video) => {
      const form = new FormData();
      form.set("room", room);
      form.set("phase", phase);
      form.set("video", video);
      const r = await req<LScanResult>("POST", hh("/scan"), undefined, form);
      await refresh();
      return r;
    },
    reset: async () => void (await act(() => req("POST", "/demo/reset"))),
  };

  return <LiveCtx.Provider value={value}>{children}</LiveCtx.Provider>;
}

// ---------- small helpers for scenes ----------

export const statusOf = (s: LIndicator["status"]) => (s === "red" ? "urgent" : s === "yellow" ? "warning" : "good") as "urgent" | "warning" | "good";

/** Backend actions are API routes; the app navigates by scene id. */
export function sceneOf(action: string) {
  if (action.startsWith("/claim/review")) return "compare";
  if (action.startsWith("/claim") || action.startsWith("/receipts")) return "claim";
  if (action.startsWith("/scan")) return "scan";
  if (action.startsWith("/bridge")) return "fund";
  if (action.startsWith("/bills")) return "bills";
  if (action.startsWith("/help-circle")) return "circle";
  if (action.startsWith("/ladder")) return "picture";
  if (action.startsWith("/coach/call-script")) return "wait";
  return "ask";
}

export const account = (d: LiveData, key: string) => d.accounts.find((a) => a.key === key);
