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
  circle?: LCircleMember[]; paycheck_delay_days?: number;
  check_in?: LCheckIn | null; share_hardship?: boolean; assigned_to?: string | null; messages?: LOutreach[];
  days_since_disaster?: number;
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
  expected_days_to_pay: number; deductible?: number; estimated_payout?: number; losses: LLoss[]; damage: { description: string; area: string; estimated_cost: number }[]; receipts: LReceipt[];
};
export type LBridge = {
  eligible: boolean; amount: number; limit: number; drawn: number; remaining: number; disbursed: boolean; repaid: boolean; reason: string; documented_losses: number;
  limits: { forty_pct_of_losses: number; sixty_days_essentials: number; half_of_payout?: number; cap: number };
  claim_filed?: boolean; held_for_review?: string[]; limited_by?: string; presets?: { label: string; amount: number }[]; rules?: string[];
};
export type LDay = { day: number; balance: number; events: { label: string; amount: number }[] };
export type LForecast = {
  days: LDay[]; payout_day: number; expected_payout: number; bridge_repayment: number; tight_day: number;
  min_balance_before_payout: number; runway_days: number | null; horizon: number; assumptions: string[];
};
export type LAtm = { id: string; name: string; lat: number; lng: number; working: boolean; hours: string; distance_km: number; closest?: boolean; minutes_driving?: number };
export type LCash = { nearest_working: LAtm | null; working: LAtm[]; out_of_service: LAtm[] };
export type LPriority = {
  id: string; name: string; rank: number; lat: number; lng: number; zip: string; score: number;
  severity: number; fragility: number; silence: number; reasons: string[]; claim_filed: boolean; synthetic: boolean;
  needs?: number; summary?: string; assigned_to?: string | null; contacted?: boolean; last_contact?: LOutreach | null;
  check_in?: LCheckIn | null; shares_hardship?: boolean;
};
export type LOutreach = { ts: string; by: string; kind: "check_in" | "assign" | "bridge_offer" | "sweep"; note: string };
export type LCheckIn = { ts: string; safe: boolean; needs: string[]; note?: string; place?: string; lat?: number | null; lng?: number | null };
export type LActivity = { ts: string; actor: string; text: string; amount: number | null; bank_ref: string | null };
export type LActivityView = {
  events: LActivity[]; messages: LOutreach[]; assigned_to: string | null; check_in: LCheckIn | null; share_hardship: boolean;
  responders_see: string[]; responders_never_see: string[];
};
export type LClaimCheck = { passed: number; total: number; ready: boolean; summary: string;
  checks: { id: string; label: string; status: "pass" | "review"; detail: string }[] };
export type LCoverage = { households: number; no_claim_started: number; urgent: number; urgent_reached: number;
  coverage_pct: number; overlooked: number; asked_for_help: number };
export type LHomeRecord = {
  every_days: number; next_due: string | null; total_value: number;
  rooms: { room: string; records: { taken_on: string; items: number; value: number; has_video: boolean }[];
    last_recorded: string | null; next_due: string | null; overdue: boolean; after_scanned: boolean; after_taken_on: string | null }[];
};
export type StaffData = { priority: LPriority[]; summary: LCoverage };
export type LScanItem = { name: string; category: string; room: string; condition: string; replacement_cost: number; actual_cash_value: number; frame_ts: number | null };
export type LScanResult = {
  room: string; phase: "before" | "after"; analysis_method: string; items: LScanItem[]; inventory_total: number;
  missing_areas: string[]; quality: { ok: boolean; warnings: string[] }; losses: LLoss[]; loss_total: number;
};
export type LCompareItem = {
  name: string; category: string; status: "unchanged" | "missing" | "damaged" | "destroyed";
  replacement_cost: number; actual_cash_value: number; before_ts: number | null; after_ts: number | null;
  before_box?: number[] | null; after_box?: number[] | null;
  loss_index: number | null; confirmed: boolean;
};
export type LCompare = {
  rooms: string[]; room: string | null; items?: LCompareItem[]; before_taken_on?: string | null; after_taken_on?: string | null; records?: number; has_video?: boolean; before_ts?: number; after_ts?: number;
  loss_total?: number; unconfirmed?: number; quality_warnings?: string[];
};
export type LDamage = { description: string; area: string; estimated_cost: number };
export type LHelp = { from_name: string; amount: number; note: string };
export type LCard =
  | { kind: "ladder"; rows: { label: string; amount: string; use: boolean }[] }
  | { kind: "when"; now: string; later: string; date: string }
  | { kind: "simulate" }
  | { kind: "picture" }
  | { kind: "safety"; rows: string[] };
export type LCoach = {
  intent: string; answer: string; card: LCard | null; next_step: LNextStep | null; assumptions: string[]; numbers_checked?: boolean;
  ai_wording_used?: boolean; actions?: { label: string; go: string }[]; follow_ups?: string[];
};
export type LTurn = { role: "user" | "looma"; text: string };
export type LHelpStatus = {
  check_in: LCheckIn | null; rank: number | null; of: number; rank_before?: number | null;
  timeline: { id: string; label: string; done: boolean; ts: string | null; detail: string }[];
  self_help: { need: string; label: string; text: string; go: string | null; ask: string | null }[];
  location?: { place: string; lat: number; lng: number; zip: string };
};

export type LiveData = {
  home: LHome; accounts: LAccount[]; bills: LBill[]; health: LHealth; ladder: LRung[]; claim: LClaim;
  bridge: LBridge; forecast: LForecast; cash: LCash;
};

export type Scenario = { claimDelayDays?: number; payoutPct?: number; missedWorkDays?: number; mortgagePause?: boolean };

// ---------- http ----------

export type LCircleMember = { name: string; relation: string; invited: boolean; asked_at?: string | null; sent: number };

async function req<T>(method: "GET" | "POST", path: string, body?: unknown, form?: FormData, staff?: string): Promise<T> {
  if (!API) throw new Error("No API configured");
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (staff) headers["X-Staff"] = staff;
  const res = await fetch(`${API}${path}`, {
    method,
    cache: "no-store",
    headers,
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
  // Family data only: the family app never downloads other households or the responder ranking.
  const [home, accounts, bills, health, ladder, claim, bridge, forecast, cash] = await Promise.all([
    req<LHome>("GET", hh()),
    req<{ accounts: LAccount[] }>("GET", hh("/accounts")),
    req<{ bills: LBill[] }>("GET", hh("/bills")),
    req<LHealth>("GET", hh("/health")),
    req<{ ladder: LRung[] }>("GET", hh("/ladder")),
    req<LClaim>("GET", hh("/claim")),
    req<LBridge>("GET", hh("/bridge")),
    req<LForecast>("GET", hh("/forecast")),
    req<LCash>("GET", hh("/cash-access")),
  ]);
  return { home, accounts: accounts.accounts, bills: bills.bills, health, ladder: ladder.ladder, claim, bridge, forecast, cash };
}

// Responder data only: ranking and coverage, never balances.
async function loadStaff(): Promise<StaffData> {
  const [list, summary] = await Promise.all([
    req<{ households: LPriority[] }>("GET", "/insurer/households?limit=2002"),
    req<LCoverage & { adjuster_queue: unknown }>("GET", "/insurer/summary"),
  ]);
  return { priority: list.households, summary };
}

// ---------- context ----------

type Live = {
  data: LiveData | null;
  /** true while the first load is running */
  loading: boolean;
  refresh: () => Promise<void>;
  forecast: (s: Scenario) => Promise<LForecast | null>;
  coach: (question: string, opts?: { history?: LTurn[]; stepId?: string }) => Promise<LCoach | null>;
  whatIf: (s: Scenario) => Promise<{ forecast: LForecast; next_steps: LNextStep[] } | null>;
  fileClaim: () => Promise<void>;
  addReceipt: (r: { merchant: string; category: "food" | "lodging" | "transport" | "other"; total: number; days_covered: number }) => Promise<LReceipt | null>;
  takeBridge: (amount?: number) => Promise<{ ref: string | null } | null>;
  helpCircle: (fromName: string, amount: number) => Promise<void>;
  mortgagePause: () => Promise<void>;
  /** Returns an error message, or null when it worked. */
  billAction: (billId: string, action: "pay" | "move") => Promise<string | null>;
  confirmRoom: (room: string) => Promise<void>;
  scan: (room: string, phase: "before" | "after", video: File) => Promise<LScanResult>;
  compare: (room?: string) => Promise<LCompare | null>;
  removeLoss: (index: number) => Promise<void>;
  damagePhoto: (photo: File) => Promise<{ line: LDamage; quality_warnings: string[] }>;
  receiptPhoto: (photo: File) => Promise<LReceipt & { duplicate?: boolean }>;
  reset: () => Promise<void>;
  checkIn: (safe: boolean, needs: string[], extra?: { note?: string; lat?: number; lng?: number }) => Promise<LHelpStatus | null>;
  helpStatus: () => Promise<LHelpStatus | null>;
  setPrivacy: (shareHardship: boolean) => Promise<void>;
  activity: () => Promise<LActivityView | null>;
  claimCheck: () => Promise<LClaimCheck | null>;
  homeRecord: () => Promise<LHomeRecord | null>;
  /** Responder portal only (signed with the staff name). */
  staff: StaffData | null;
  staffName: string | null;
  reachOut: (id: string, kind: "check_in" | "bridge_offer") => Promise<boolean>;
  assign: (id: string, to: string) => Promise<boolean>;
  sweep: () => Promise<{ reached: number } | null>;
  addToCircle: (name: string, relation: string) => Promise<boolean>;
  requestHelp: (names?: string[], amount?: number) => Promise<string | null>;
  demo: {
    disaster: () => Promise<void>;
    delayPaycheck: (days: number) => Promise<void>;
    presetScan: (phase: "before" | "after", room?: string) => Promise<boolean>;
  };
};

const LiveCtx = createContext<Live>(null as unknown as Live);
export const useLive = () => useContext(LiveCtx);

/** mode "family": one household's data. mode "staff": the responder ranking (signed with staffName). */
export function LiveProvider({ children, staffName = null }: { children: React.ReactNode; staffName?: string | null }) {
  const [data, setData] = useState<LiveData | null>(null);
  const [staffData, setStaffData] = useState<StaffData | null>(null);
  const [loading, setLoading] = useState(!!API);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    if (!API) return;
    const n = ++seq.current;
    try {
      if (staffName) {
        const d = await loadStaff();
        if (n === seq.current) setStaffData(d);
      } else {
        const d = await loadAll();
        if (n === seq.current) setData(d);
      }
    } catch {
      if (n === seq.current) (staffName ? setStaffData(null) : setData(null)); // backend down: scenes fall back to mock data
    } finally {
      setLoading(false);
    }
  }, [staffName]);

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
    coach: async (question, opts) => {
      if (!API) return null;
      try {
        return await req("POST", hh("/coach"), { question, history: opts?.history ?? [], step_id: opts?.stepId ?? null });
      } catch {
        return null;
      }
    },
    fileClaim: async () => void (await act(() => req("POST", hh("/claim/file")))),
    addReceipt: async (r) => (await act(() => req<{ receipt: LReceipt }>("POST", hh("/receipt/manual"), r)))?.receipt ?? null,
    takeBridge: async (amount) => {
      const r = await act(() => req<{ nessie_transaction_id: string | null }>("POST", hh("/bridge/disburse"), amount ? { amount } : {}));
      return r ? { ref: r.nessie_transaction_id } : null;
    },
    helpCircle: async (fromName, amount) => void (await act(() => req("POST", hh("/help-circle"), { from_name: fromName, amount }))),
    mortgagePause: async () => void (await act(() => req("POST", hh("/mortgage-pause")))),
    billAction: async (billId, action) => {
      try {
        await req("POST", hh(`/bills/${billId}`), { action });
        await refresh();
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "That didn't go through";
      }
    },
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
    compare: async (room) => {
      if (!API) return null;
      try {
        return await req<LCompare>("GET", hh(`/compare${room ? `?room=${encodeURIComponent(room)}` : ""}`));
      } catch {
        return null;
      }
    },
    removeLoss: async (index) => void (await act(() => req("POST", hh("/losses/review"), { edits: [{ index, remove: true }] }))),
    damagePhoto: async (photo) => {
      const form = new FormData();
      form.set("photo", photo);
      const r = await req<{ line: LDamage; quality_warnings: string[] }>("POST", hh("/damage-photo"), undefined, form);
      await refresh();
      return r;
    },
    receiptPhoto: async (photo) => {
      const form = new FormData();
      form.set("photo", photo);
      const r = await req<{ receipt: LReceipt; duplicate?: boolean }>("POST", hh("/receipt"), undefined, form);
      await refresh();
      return { ...r.receipt, duplicate: r.duplicate };
    },
    reset: async () => void (await act(() => req("POST", "/demo/reset"))),
    checkIn: async (safe, needs, extra) => act(() => req<LHelpStatus>("POST", hh("/check-in"), { safe, needs, ...extra })),
    helpStatus: async () => (API ? req<LHelpStatus>("GET", hh("/help-status")).catch(() => null) : null),
    setPrivacy: async (share) => void (await act(() => req("POST", hh("/privacy"), { share_hardship: share }))),
    activity: async () => (API ? req<LActivityView>("GET", hh("/activity")).catch(() => null) : null),
    homeRecord: async () => (API ? req<LHomeRecord>("GET", hh("/home-record")).catch(() => null) : null),
    claimCheck: async () => (API ? req<LClaimCheck>("GET", hh("/claim/check")).catch(() => null) : null),
    staff: staffData,
    staffName,
    reachOut: async (id, kind) =>
      (await act(() => req("POST", `/insurer/households/${id}/reach-out`, { kind }, undefined, staffName ?? ""))) !== null,
    assign: async (id, to) =>
      (await act(() => req("POST", `/insurer/households/${id}/assign`, { to }, undefined, staffName ?? ""))) !== null,
    sweep: async () => act(() => req<{ reached: number }>("POST", "/insurer/sweep", undefined, undefined, staffName ?? "")),
    addToCircle: async (name, relation) => (await act(() => req("POST", hh("/circle"), { name, relation }))) !== null,
    requestHelp: async (names, amount) => (await act(() => req<{ link: string }>("POST", hh("/circle/request"), { names: names ?? [], amount: amount ?? null })))?.link ?? null,
    demo: {
      disaster: async () => void (await act(() => req("POST", "/demo/disaster"))),
      delayPaycheck: async (days) => void (await act(() => req("POST", `/demo/delay-paycheck?days=${days}`))),
      presetScan: async (phase, room = "Garage") =>
        (await act(() => req("POST", `/demo/scan?phase=${phase}&room=${encodeURIComponent(room)}`))) !== null,
    },
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

/** URL of a video frame (proof photo) for a scanned room. */
/** A real frame from the family's video. With a box: mode "crop" zooms on the item, "mark" outlines it. */
export const frameUrl = (
  room: string, phase: "before" | "after", ts: number | null | undefined,
  box?: number[] | null, mode: "full" | "crop" | "mark" = "full",
) =>
  API
    ? `${API}/households/${HOUSEHOLD}/frame?room=${encodeURIComponent(room)}&phase=${phase}&ts=${ts ?? 1}` +
      (box && mode !== "full" ? `&box=${box.join(",")}&mode=${mode}` : "")
    : "";
