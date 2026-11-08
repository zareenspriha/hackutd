// Richer Garcia data for the full flow. Numbers line up with mock.ts.
import { forecast } from "./mock";

export type AccountRow = { id: string; name: string; amount: string; note?: string; source: "bank" | "profile" };

export const have: AccountRow[] = [
  { id: "chk", name: "Checking", amount: "$640", source: "bank" },
  { id: "sav", name: "Savings", amount: "$900", source: "bank" },
  { id: "cd", name: "CD", amount: "$5,000", note: "matures in 5 weeks", source: "profile" },
  { id: "ira", name: "IRA", amount: "$14,000", note: "early withdrawal costs taxes and penalties", source: "profile" },
];
export const owe: AccountRow[] = [
  { id: "cc", name: "Credit card", amount: "$2,100", note: "of $3,000 limit", source: "bank" },
  { id: "auto", name: "Auto loan", amount: "$380/mo", source: "profile" },
  { id: "pl", name: "Personal loan", amount: "$120/mo", source: "profile" },
  { id: "mort", name: "Mortgage", amount: "$1,450/mo", source: "profile" },
];
export const comingIn = (bridgeTaken: boolean, sister: boolean): AccountRow[] => [
  { id: "bf", name: "Bridge Funds", amount: bridgeTaken ? "$2,480 received" : "$2,480 available", source: "bank" },
  { id: "hc", name: "Help Circle", amount: sister ? "$200 received" : "$0 so far", source: "bank" },
  { id: "ins", name: "Insurance payout", amount: "$8,420 expected", note: "around Nov 29", source: "profile" },
];

export type Status = "good" | "warning" | "urgent";
export type Indicator = { key: string; label: string; value: string; status: Status; explanation: string; assumptions: string[] };

export function indicators(bridgeTaken: boolean, sister: boolean, paycheckDelayed: boolean): Indicator[] {
  const pts = forecast(3, 1, paycheckDelayed ? 2 : 0, bridgeTaken ? 2480 : 0).map((p) => ({ ...p, balance: p.balance + (sister ? 200 : 0) }));
  const firstShort = pts.findIndex((p) => p.balance < 0);
  const runway = firstShort === -1 ? null : firstShort;
  return [
    {
      key: "runway",
      label: "Your money lasts",
      value: runway === null ? "until the claim pays" : `${runway} days`,
      status: runway === null ? "good" : runway < 14 ? "urgent" : "warning",
      explanation: runway === null ? "Bridge Funds carry you to the payout." : "Checking and savings run out before the claim pays.",
      assumptions: ["Spending $95 a day on essentials", "Hotel $89 a night for 14 nights", "Claim pays in 3 weeks"],
    },
    {
      key: "deductible",
      label: "Deductible covered",
      value: "$900 of $2,500",
      status: "warning",
      explanation: "Savings cover about a third of your deductible.",
      assumptions: ["Deductible is taken out of the payout", "Savings balance today: $900"],
    },
    {
      key: "bills",
      label: "Bills at risk",
      value: bridgeTaken ? "0 bills" : "2 bills, $1,830",
      status: bridgeTaken ? "good" : "urgent",
      explanation: bridgeTaken ? "Every bill before the payout has a plan." : "Car payment and mortgage are due before the claim pays.",
      assumptions: ["Due dates from your accounts", "Claim pays around Nov 29"],
    },
    {
      key: "debt",
      label: "Debt pressure",
      value: "70% of card limit",
      status: "warning",
      explanation: "Use the card for essentials only.",
      assumptions: ["Card balance $2,100 of $3,000", "Payments are 21% of monthly income"],
    },
  ];
}

export type Rung = { order: number; label: string; amount: string; kind: "use" | "ask" | "limited" | "protect"; note: string };
export const ladder: Rung[] = [
  { order: 1, label: "Bridge Funds and Help Circle", amount: "$2,480 + $200", kind: "use", note: "Use first. Repaid by the payout." },
  { order: 2, label: "Checking and savings", amount: "$1,540", kind: "use", note: "Keep $900 toward the deductible." },
  { order: 3, label: "Ask the lender for a mortgage pause", amount: "saves $1,450", kind: "ask", note: "Most lenders offer disaster forbearance." },
  { order: 4, label: "Credit card", amount: "$900 left", kind: "limited", note: "Essentials only." },
  { order: 5, label: "CD", amount: "$5,000", kind: "protect", note: "Matures in 5 weeks. Breaking it costs interest." },
  { order: 6, label: "IRA", amount: "$14,000", kind: "protect", note: "Early withdrawal costs taxes and penalties." },
];

export const circle = [
  { initials: "AG", name: "Ana Garcia", rel: "sister", sent: 200 },
  { initials: "JR", name: "José Ramos", rel: "uncle", sent: 0 },
  { initials: "LM", name: "Lucía Morales", rel: "friend", sent: 0 },
];

export const atms = [
  { name: "ATM · Preston Rd & Park Blvd", dist: "0.4 mi", open: true, x: 58, y: 40 },
  { name: "Branch · Legacy Dr", dist: "1.1 mi", open: true, x: 72, y: 26 },
  { name: "ATM · Coit Rd Market", dist: "1.6 mi", open: true, x: 34, y: 66 },
  { name: "ATM · Spring Creek Pkwy", dist: "2.3 mi", open: false, x: 22, y: 30 },
];

// Before/after comparison for the living room.
export type CItem = {
  id: string;
  name: string;
  status: "unchanged" | "moved" | "damaged" | "missing" | "review";
  damageType?: string;
  severity?: 0 | 1 | 2 | 3;
  confidence?: "high" | "medium" | "low";
  evidence?: string;
  rc: number;
  acv: number;
  box: { x: number; y: number; w: number; h: number }; // 0-1 of the AFTER frame
  beforeBox?: { x: number; y: number; w: number; h: number };
};
export const compareItems: CItem[] = [
  { id: "box", name: "Small appliance (boxed)", status: "damaged", damageType: "Water staining", severity: 3, confidence: "high", evidence: "Brown staining across the lower half of the box", rc: 180, acv: 126, box: { x: 0.56, y: 0.6, w: 0.17, h: 0.2 } },
  { id: "rug", name: "Area rug", status: "damaged", damageType: "Soaked, warped", severity: 2, confidence: "high", evidence: "Dark waterline across the rug edge", rc: 260, acv: 182, box: { x: 0.08, y: 0.84, w: 0.52, h: 0.13 } },
  { id: "phones", name: "Headphones", status: "missing", confidence: "high", evidence: "Seen on the desk before, not found after", rc: 250, acv: 175, box: { x: 0.36, y: 0.38, w: 0.1, h: 0.1 } },
  { id: "bag", name: "Backpack", status: "moved", confidence: "high", evidence: "Same backpack, now on the chair", rc: 80, acv: 56, box: { x: 0.74, y: 0.42, w: 0.12, h: 0.18 }, beforeBox: { x: 0.8, y: 0.68, w: 0.12, h: 0.18 } },
  { id: "lamp", name: "Floor lamp", status: "review", confidence: "low", evidence: "Base looks darker. Could be shadow.", rc: 95, acv: 66, box: { x: 0.04, y: 0.26, w: 0.08, h: 0.56 } },
  { id: "laptop", name: "Laptop", status: "unchanged", confidence: "high", rc: 1100, acv: 770, box: { x: 0.2, y: 0.38, w: 0.14, h: 0.1 } },
  { id: "bottle", name: "Water bottle", status: "unchanged", confidence: "high", rc: 30, acv: 21, box: { x: 0.48, y: 0.38, w: 0.04, h: 0.1 } },
  { id: "plant", name: "Plant stand", status: "unchanged", confidence: "medium", rc: 40, acv: 28, box: { x: 0.88, y: 0.5, w: 0.08, h: 0.3 } },
];
