"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Banknote, CreditCard, Lock, PiggyBank } from "lucide-react";
import { useDemo } from "../demo";
import { Assumptions, EASE, Rise, StatusPill, useNav } from "../ui";
import { comingIn, have, indicators, ladder, owe, type AccountRow } from "@/lib/demoData";

type Tab = "have" | "health" | "ladder";
const tabs: { id: Tab; label: string; q: string }[] = [
  { id: "have", label: "What do I have?", q: "" },
  { id: "health", label: "Am I okay?", q: "" },
  { id: "ladder", label: "Where do I go?", q: "" },
];
const statusLabel = { good: "On track", warning: "Watch this", urgent: "Act now" } as const;
const rungStyle = {
  use: "bg-midnight text-cream-2",
  ask: "bg-cream text-navy border border-navy/[0.08]",
  limited: "bg-amber/20 text-navy border border-amber/40",
  protect: "bg-cream-2 text-dusty-deep border border-dashed border-slate",
};
const rungTag = { use: "Use first", ask: "Ask", limited: "Essentials only", protect: "Protect" };

/** My money: one question at a time, answered in plain words. */
export default function Picture() {
  const { go } = useNav();
  const { s } = useDemo();
  const [tab, setTab] = useState<Tab>("have");
  const ind = indicators(s.bridgeTaken, s.sisterSent, s.paycheckDelayed);
  const spendable = 1540 + (s.bridgeTaken ? 2480 : 0) + (s.sisterSent ? 200 : 0);

  return (
    <div className="mx-auto min-h-full max-w-[960px] px-10 pb-28 pt-12">
      <Rise>
        <p className="eyebrow">My money</p>
        <h1 className="headline mt-4 text-[60px]">
          You can spend <span className="tnum">${spendable.toLocaleString()}</span>
          <span className="text-dusty"> today.</span>
        </h1>
        <p className="mt-3 text-lg text-dusty-deep">Without touching your CD or IRA. ${s.bridgeTaken ? "8,420" : "10,900"} more is on the way.</p>
      </Rise>

      <Rise delay={0.15} className="mt-8 inline-flex rounded-full border border-midnight/10 bg-cream-2/70 p-1.5" >
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} role="tab" aria-selected={tab === t.id} className="relative h-10 rounded-full px-5 text-[15px]">
            {tab === t.id && <motion.span layoutId="money-tab" className="absolute inset-0 rounded-full bg-midnight" transition={{ duration: 0.28, ease: EASE }} />}
            <span className={`relative ${tab === t.id ? "text-cream-2" : "text-dusty-deep"}`}>{t.label}</span>
          </button>
        ))}
      </Rise>

      <div className="mt-6">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28, ease: EASE }}>
            {tab === "have" && (
              <div className="grid grid-cols-3 gap-4">
                <Group title="Money you have" rows={have} icon={PiggyBank} />
                <Group title="What you owe" rows={owe} icon={CreditCard} />
                <Group title="Coming in" rows={comingIn(s.bridgeTaken, s.sisterSent)} icon={Banknote} />
              </div>
            )}
            {tab === "health" && (
              <div className="grid grid-cols-2 gap-4">
                {ind.map((x) => (
                  <div key={x.key} className="rounded-[20px] border border-navy/[0.08] bg-cream p-6">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-dusty-deep">{x.label}</p>
                      <StatusPill status={x.status} label={statusLabel[x.status]} />
                    </div>
                    <p className="tnum mt-1 text-[32px] font-light leading-tight text-navy">{x.value}</p>
                    <p className="text-dusty-deep">{x.explanation}</p>
                    <Assumptions items={x.assumptions} />
                  </div>
                ))}
              </div>
            )}
            {tab === "ladder" && (
              <div className="grid grid-cols-[1fr_280px] gap-6">
                <ol className="space-y-2">
                  {ladder.map((r, i) => (
                    <motion.li key={r.order} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05, duration: 0.28, ease: EASE }} className={`rounded-[16px] px-5 py-3.5 ${rungStyle[r.kind]}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-2 text-[17px] font-medium">
                          <span className="tnum opacity-60">{r.order}</span>
                          {r.kind === "protect" && <Lock className="h-4 w-4" strokeWidth={1.75} />}
                          {r.label}
                        </p>
                        <p className="tnum shrink-0">{r.amount}</p>
                      </div>
                      <p className={`mt-0.5 text-sm ${r.kind === "use" ? "text-ivory" : "text-dusty-deep"}`}>
                        <span className="font-semibold uppercase tracking-[0.12em]">{rungTag[r.kind]}</span> · {r.note}
                      </p>
                    </motion.li>
                  ))}
                </ol>
                <div className="self-start rounded-[20px] bg-midnight p-6 text-cream-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-ivory">The rule</p>
                  <p className="mt-2 text-[22px] font-light leading-snug">Spend from the top. Protect the bottom.</p>
                  <button onClick={() => go("ask")} className="pill mt-5 bg-cream-2 text-midnight hover:bg-white">
                    Ask about a purchase <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Group({ title, rows, icon: Icon }: { title: string; rows: AccountRow[]; icon: typeof PiggyBank }) {
  return (
    <div className="rounded-[20px] border border-navy/[0.08] bg-cream p-5">
      <p className="eyebrow flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} /> {title}
      </p>
      <ul className="mt-2">
        {rows.map((r) => (
          <li key={r.id} className="border-b border-navy/[0.06] py-2.5 last:border-0">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-navy">{r.name}</p>
              <p className="tnum text-navy">{r.amount}</p>
            </div>
            {r.note && <p className="text-xs text-dusty-deep">{r.note}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
