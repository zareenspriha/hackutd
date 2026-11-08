"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Banknote, CreditCard, Lock, PiggyBank } from "lucide-react";
import { useDemo } from "../demo";
import { Assumptions, EASE, Rise, StatusPill, useNav } from "../ui";
import { comingIn, have, indicators, ladder, owe, type AccountRow, type Indicator, type Rung } from "@/lib/demoData";
import { account, statusOf, useLive, type LiveData } from "@/lib/live";
import { usd } from "@/lib/format";

const dateIn = (days: number) => new Date(Date.now() + days * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Backend data in the shapes this scene draws. */
function liveView(d: LiveData) {
  const a = (k: string) => account(d, k);
  const bridgeLeft = d.bridge.eligible ? d.bridge.amount : 0;
  const help = d.home.help_circle.reduce((t, g) => t + g.amount, 0);
  const have: AccountRow[] = [
    { id: "chk", name: "Checking", amount: usd(a("checking")?.amount ?? 0), source: "bank" },
    { id: "sav", name: "Savings", amount: usd(a("savings")?.amount ?? 0), source: "bank" },
    { id: "cd", name: "CD", amount: usd(a("cd")?.amount ?? 0), note: `matures in ${a("cd")?.matures_in_weeks ?? 0} weeks`, source: "profile" },
    { id: "ira", name: "IRA", amount: usd(a("ira")?.amount ?? 0), note: "early withdrawal costs taxes and penalties", source: "profile" },
  ];
  const owe: AccountRow[] = [
    { id: "cc", name: "Credit card", amount: usd(a("credit_card")?.amount ?? 0), note: `of ${usd(a("credit_card")?.limit ?? 0)} limit`, source: "bank" },
    { id: "auto", name: "Auto loan", amount: `${usd(a("auto_loan")?.monthly_payment ?? 0)}/mo`, source: "profile" },
    ...((a("personal_loan")?.monthly_payment ?? 0) > 0 ? [{ id: "pl", name: "Personal loan", amount: `${usd(a("personal_loan")!.monthly_payment!)}/mo`, source: "profile" as const }] : []),
    { id: "mort", name: "Mortgage", amount: `${usd(a("mortgage")?.monthly_payment ?? 0)}/mo`, source: "profile" },
  ];
  const coming: AccountRow[] = [
    { id: "bf", name: "Bridge Funds", amount: d.bridge.disbursed ? `${usd(d.bridge.amount)} received` : bridgeLeft ? `${usd(bridgeLeft)} available` : "after you add proof", source: "bank" },
    { id: "hc", name: "Help Circle", amount: help ? `${usd(help)} received` : "$0 so far", source: "bank" },
    { id: "ins", name: "Insurance payout", amount: `${usd(d.forecast.expected_payout)} expected`, note: `around ${dateIn(d.forecast.payout_day)}`, source: "profile" },
  ];
  const h = d.health;
  const ind: Indicator[] = [
    { key: "runway", label: "Your money lasts", value: d.forecast.runway_days == null ? "until the claim pays" : `${d.forecast.runway_days} days`, status: statusOf(h.runway.status), explanation: h.runway.text, assumptions: d.forecast.assumptions },
    { key: "deductible", label: "Deductible covered", value: `${usd(a("savings")?.amount ?? 0)} of ${usd(d.home.deductible)}`, status: statusOf(h.deductible.status), explanation: h.deductible.text, assumptions: ["The deductible comes out of the payout", `Savings balance today: ${usd(a("savings")?.amount ?? 0)}`] },
    { key: "bills", label: "Bills at risk", value: `${h.bills_at_risk.value} bill${h.bills_at_risk.value === 1 ? "" : "s"}`, status: statusOf(h.bills_at_risk.status), explanation: h.bills_at_risk.text, assumptions: ["Due dates from your accounts", `Claim pays around ${dateIn(d.forecast.payout_day)}`] },
    { key: "debt", label: "Debt pressure", value: `${h.debt_pressure.value}% of income`, status: statusOf(h.debt_pressure.status), explanation: h.debt_pressure.text, assumptions: ["Loan, mortgage and minimum card payments", "Compared with monthly income"] },
  ];
  const kind = { use: "use", ask: "ask", essentials_only: "limited", protect: "protect" } as const;
  const held: Record<string, string> = { cd: usd(a("cd")?.amount ?? 0), ira: usd(a("ira")?.amount ?? 0) };
  const rungs: Rung[] = d.ladder.map((r) => ({
    order: r.rank,
    label: r.name,
    amount: r.action === "protect" ? held[r.key] ?? "" : r.action === "ask" ? (r.available ? `saves ${usd(r.available)}` : "done") : usd(r.available),
    kind: kind[r.action],
    note: r.text,
  }));
  // Free money: the lowest balance before the payout (bills, hotel and essentials already paid),
  // plus Bridge Funds not drawn yet. Below zero means a shortfall, shown plainly instead of "$0".
  const free = d.forecast.min_balance_before_payout + (d.bridge.eligible ? d.bridge.remaining : 0);
  const spendable = Math.max(0, free);
  const onTheWay = d.forecast.expected_payout + bridgeLeft;
  const shortBy = Math.max(0, -free);
  return { have, owe, coming, ind, rungs, spendable, onTheWay, shortBy };
}

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
  const { data: d } = useLive();
  const [tab, setTab] = useState<Tab>("have");
  const v = d
    ? liveView(d)
    : {
        have, owe, coming: comingIn(s.bridgeTaken, s.sisterSent), ind: indicators(s.bridgeTaken, s.sisterSent, s.paycheckDelayed), rungs: ladder,
        spendable: 1540 + (s.bridgeTaken ? 2480 : 0) + (s.sisterSent ? 200 : 0), onTheWay: s.bridgeTaken ? 8420 : 10900,
      };
  const { ind, spendable } = v;

  return (
    <div className="mx-auto min-h-full max-w-[960px] px-10 pb-28 pt-12">
      <Rise>
        <p className="eyebrow">My money</p>
        {spendable < 1 && "shortBy" in v && v.shortBy > 0 ? (
          <>
            <h1 className="headline mt-4 text-[60px]">
              You&apos;re <span className="tnum">{usd(v.shortBy)}</span> <span className="text-dusty">short before the claim pays.</span>
            </h1>
            <p className="mt-3 text-lg text-dusty-deep">
              Your bills and hotel cost more than you have until the payout. <button onClick={() => setTab("ladder")} className="font-medium text-midnight underline underline-offset-4">See how to cover it</button>.
            </p>
          </>
        ) : (
          <>
            <h1 className="headline mt-4 text-[60px]">
              You can spend <span className="tnum">${Math.round(spendable).toLocaleString()}</span>
              <span className="text-dusty"> today.</span>
            </h1>
            <p className="mt-3 text-lg text-dusty-deep">After your bills, hotel and essentials until the claim pays, without touching your CD or IRA. {usd(v.onTheWay)} more is on the way.</p>
          </>
        )}
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
                <Group title="Money you have" rows={v.have} icon={PiggyBank} />
                <Group title="What you owe" rows={v.owe} icon={CreditCard} />
                <Group title="Coming in" rows={v.coming} icon={Banknote} />
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
                  {v.rungs.map((r, i) => (
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
