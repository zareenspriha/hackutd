"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CloudRain, HandHeart, RotateCcw, ScanLine, Timer, X } from "lucide-react";
import type { NextStep } from "@/lib/types";

/**
 * Shared demo state: what has happened to the Garcias so far. Every scene reads it, so the story
 * stays consistent as you move through it. Shift+D opens the presenter panel.
 * TODO (backend): each control maps to POST /demo/{action}.
 */
export type DemoState = {
  disasterMode: boolean;
  claimFiled: boolean;
  receiptAdded: boolean;
  scanAdded: boolean;
  bridgeTaken: boolean;
  sisterSent: boolean;
  paycheckDelayed: boolean;
  mortgageCalled: boolean;
  scanPreset: "none" | "before" | "after";
};
const initial: DemoState = {
  disasterMode: true, claimFiled: false, receiptAdded: false, scanAdded: false, bridgeTaken: false,
  sisterSent: false, paycheckDelayed: false, mortgageCalled: false, scanPreset: "none",
};

type Toast = { id: number; text: string };
type Ctx = {
  s: DemoState;
  set: (p: Partial<DemoState>) => void;
  toast: (t: string) => void;
  steps: NextStep[];
};
const DemoCtx = createContext<Ctx>(null as unknown as Ctx);
export const useDemo = () => useContext(DemoCtx);

/** Mirrors the backend rules engine (next_steps.py): priority-ordered rules, top 3 that apply. */
export function computeSteps(s: DemoState): NextStep[] {
  const all: (NextStep & { when: boolean })[] = [
    { id: "file_claim", title: "File your claim today", why: "Your loss list is ready to send. You can add more later.", action: "claim", priority: 1, done: s.claimFiled, when: true },
    { id: "rescan", title: "Add 3 items from the living room", why: "Your after scan found $690 more to claim.", action: "compare", priority: 2, done: s.scanAdded, when: true },
    { id: "bridge_funds", title: "Unlock $2,480 in Bridge Funds", why: "Repaid automatically when your insurance pays.", action: "fund", priority: 3, done: s.bridgeTaken, when: true },
    { id: "pay_car", title: "Pay your car payment ($380) by Friday", why: "The one bill before the payout that can't wait.", action: "fund", priority: 4, done: false, when: true },
    { id: "mortgage", title: "Call your lender about a mortgage pause", why: "Saves $1,450 this month.", action: "wait", priority: 5, done: s.mortgageCalled, when: s.bridgeTaken },
    { id: "receipts", title: "Snap your hotel receipts", why: "About $1,246 of it counts toward your claim.", action: "claim", priority: 7, done: s.receiptAdded, when: true },
  ];
  return all.filter((x) => x.when);
}

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<DemoState>(initial);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [panel, setPanel] = useState(false);

  const set = useCallback((p: Partial<DemoState>) => setS((o) => ({ ...o, ...p })), []);
  const toast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);
  const steps = useMemo(() => computeSteps(s), [s]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.key === "D" || e.key === "d")) setPanel((p) => !p);
      if (e.key === "Escape") setPanel(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const actions = [
    { icon: ScanLine, label: "Load before scan", run: () => (set({ scanPreset: "before" }), toast("Before scan loaded")) },
    { icon: ScanLine, label: "Load after scan", run: () => (set({ scanPreset: "after" }), toast("After scan loaded")) },
    { icon: CloudRain, label: "Trigger flood", run: () => (set({ disasterMode: true }), toast("Disaster Mode is on. Late fees are paused.")) },
    { icon: HandHeart, label: "Sister sends $200", run: () => (set({ sisterSent: true }), toast("Your sister sent $200")) },
    { icon: Timer, label: "Delay paycheck", run: () => (set({ paycheckDelayed: true }), toast("Paycheck delayed two weeks")) },
    { icon: RotateCcw, label: "Reset demo", run: () => (setS(initial), toast("Demo reset")) },
  ];

  return (
    <DemoCtx.Provider value={{ s, set, toast, steps }}>
      {children}

      {/* toasts */}
      <div className="pointer-events-none fixed inset-x-0 top-6 z-50 flex flex-col items-center gap-2" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-full bg-midnight px-5 py-3 text-[15px] text-cream-2 shadow-lg"
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* presenter panel */}
      <AnimatePresence>
        {panel && (
          <motion.aside
            initial={{ x: 380 }}
            animate={{ x: 0 }}
            exit={{ x: 380 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="fixed right-4 top-4 z-50 w-[340px] rounded-[24px] bg-navy p-6 text-ivory shadow-2xl"
            role="dialog"
            aria-label="Demo controls"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-[0.22em]">demo controls</p>
              <button onClick={() => setPanel(false)} aria-label="Close" className="rounded-full p-1.5 hover:bg-raised">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 space-y-2">
              {actions.map((a) => (
                <button key={a.label} onClick={a.run} className="flex w-full items-center gap-3 rounded-2xl bg-midnight px-4 py-3 text-left text-cream-2 transition hover:bg-raised">
                  <a.icon className="h-[18px] w-[18px]" strokeWidth={1.75} /> {a.label}
                </button>
              ))}
            </div>
            <p className="mt-5 text-xs text-ivory/70">Shift+D toggles this panel. ← → move between scenes.</p>
          </motion.aside>
        )}
      </AnimatePresence>
    </DemoCtx.Provider>
  );
}
