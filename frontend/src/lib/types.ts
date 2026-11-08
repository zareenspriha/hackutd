// Shared shapes between the frontend and the FastAPI backend.
// Keep these in sync with backend/models.py.

export type Account = {
  id: string;
  type: "checking" | "savings" | "cd" | "ira" | "credit_card" | "auto_loan" | "personal_loan" | "mortgage";
  label: string;
  balance: number; // dollars; negative-meaning accounts (loans, cards) store amount owed
  limit?: number;
  monthlyPayment?: number;
  maturesInWeeks?: number;
};

export type NextStep = {
  id: string;
  title: string;
  why: string;
  action: string; // route in the family app
  priority: number;
  done: boolean;
};

export type Item = {
  id: string;
  room: string;
  name: string;
  category: string;
  condition: "good" | "damaged" | "missing";
  replacementCost: number;
  acv: number;
  beforeFrame?: string;
  afterFrame?: string;
};

export type ClaimLine = {
  id: string;
  kind: "belongings" | "home_damage" | "living_expense";
  label: string;
  amount: number;
  documented: boolean;
};

export type Bill = {
  id: string;
  name: string;
  amount: number;
  due: string; // ISO date
  label: "pay_now" | "move" | "call";
};

export type HealthIndicators = {
  runwayDays: number;
  deductibleCovered: boolean;
  billsAtRisk: number;
  debtPressurePct: number;
};

export type Household = {
  id: string;
  name: string;
  disasterMode: boolean;
  claimFiled: boolean;
  accounts: Account[];
  deductible: number;
  weeklyGroceryBaseline: number;
  expectedClaimWeeks: number;
  claim: ClaimLine[];
  bills: Bill[];
  health: HealthIndicators;
  bridgeFunds: { eligible: number; taken: number };
};

export type PriorityHousehold = {
  id: string;
  lat: number;
  lng: number;
  score: number; // 0-100
  severity: number; // 0-40
  fragility: number; // 0-30
  silence: number; // 0-30
  reasons: string[];
  isDemo?: boolean;
  zip?: string;
  tier?: "urgent" | "high" | "medium" | "low";
  name?: string;
};

export type ForecastPoint = { day: number; balance: number };
