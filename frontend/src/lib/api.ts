// Thin client for the FastAPI backend. Every call falls back to mock data,
// so the UI keeps working if the backend is down (also our demo fallback).
import { garciaNextSteps, garcias, scannedItems, syntheticHouseholds } from "./mock";
import type { Household, Item, NextStep, PriorityHousehold } from "./types";

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

export const api = {
  household: (id = "garcia") => get<Household>(`/households/${id}`, garcias),
  nextSteps: (id = "garcia", scenario?: string) =>
    get<NextStep[]>(`/households/${id}/next-steps${scenario ? `?scenario=${scenario}` : ""}`, garciaNextSteps),
  items: (id = "garcia") => get<Item[]>(`/households/${id}/items`, scannedItems),
  priority: () => get<PriorityHousehold[]>(`/priority`, syntheticHouseholds()),
  unlockBridgeFunds: (id = "garcia") =>
    post<{ amount: number }>(`/households/${id}/bridge-funds`, {}, { amount: garcias.bridgeFunds.eligible }),
  coach: (id: string, message: string) =>
    post<{ answer: string; nextStep?: string }>(`/households/${id}/coach`, { message }, {
      answer:
        "Yes, if you use Bridge Funds first. Two weeks at $89/night is $1,246. Bridge Funds cover it and leave $1,234. Keep your CD untouched, it matures in 5 weeks.",
      nextStep: "Unlock your Bridge Funds",
    }),
};
