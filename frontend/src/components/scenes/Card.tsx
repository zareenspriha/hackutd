"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { ArrowRight, BedDouble, Check, Fuel, Lock, Pill, ShoppingBasket, Tv, UtensilsCrossed, X } from "lucide-react";
import Logo from "../Logo";
import { useDemo } from "../demo";
import { Assumptions, CountUp, EASE, useNav } from "../ui";
import { useLive, type LCard_ } from "@/lib/live";
import { usd } from "@/lib/format";

const ICON: Record<string, typeof BedDouble> = {
  lodging: BedDouble, groceries: ShoppingBasket, restaurant: UtensilsCrossed, pharmacy: Pill, gas: Fuel, electronics: Tv,
};
const time = (ts: string) => new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/**
 * Recovery Card: Bridge Funds on a card that only works at essentials.
 * Every approved tap is a real (sandbox) bank purchase and lands on the claim as proof automatically.
 */
export default function Card() {
  const live = useLive();
  const { go } = useNav();
  const { toast } = useDemo();
  const [c, setC] = useState<LCard_ | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<{ ok: boolean; text: string } | null>(null);
  const card = useAnimationControls();
  const claimExtra = live.data?.claim.owed.extra_living_expenses ?? 0;

  useEffect(() => {
    if (live.data) live.card().then(setC);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!live.data]);

  async function activate() {
    setBusy("activate");
    const r = await live.activateCard();
    setBusy(null);
    if (r) setC(r);
    else toast("Take Bridge Funds first. The card spends them.");
  }

  async function tap(id: string) {
    setBusy(id);
    const r = await live.cardBuy(id);
    setBusy(null);
    if (!r) return toast("That didn't go through. Try again.");
    setC(r.card);
    setLast({ ok: r.approved, text: r.reason });
    card.start(r.approved
      ? { scale: [1, 1.03, 1], transition: { duration: 0.4 } }
      : { x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.45 } });
  }

  const locked = !c?.active;
  const noFunds = !!c && c.limit <= 0;

  return (
    <div className="flex min-h-full items-center justify-center bg-[radial-gradient(70%_60%_at_50%_0%,#24395a,#0f1a2b_70%)] px-10 pb-24 pt-10 text-cream-2">
      <div className="grid w-full max-w-[1080px] grid-cols-1 items-start gap-10 xl:grid-cols-[1fr_440px] xl:gap-14">
        {/* left: what it is, and what it's done so far */}
        <div className="pt-6">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-ivory/70">Recovery card</p>
          <h1 className="mt-4 text-[44px] font-light xl:text-[52px] leading-[1] tracking-[-0.03em]">
            Spend it on recovery. <span className="text-ivory/60">We&apos;ll handle the proof.</span>
          </h1>
          <p className="mt-5 max-w-md text-lg text-ivory/80">
            Your Bridge Funds on a card that only works at essentials. Every hotel night and meal is added to your claim the moment you pay. No receipts to snap.
          </p>

          {c && !locked && (
            <div className="mt-8 grid max-w-md grid-cols-2 gap-3">
              <div className="rounded-[20px] border border-ivory/10 bg-navy/60 p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-ivory/60">Left on card</p>
                <CountUp value={c.available} className="mt-2 block text-[36px] font-light leading-none" />
                <p className="mt-1 text-xs text-ivory/60">of {usd(c.limit)} Bridge Funds</p>
              </div>
              <div className="rounded-[20px] bg-cream-2 p-5 text-navy">
                <p className="text-xs uppercase tracking-[0.18em] text-dusty-deep">Added to your claim</p>
                <CountUp value={c.added_to_claim} className="mt-2 block text-[36px] font-light leading-none" />
                <p className="mt-1 text-xs text-dusty-deep">Extra living costs now {usd(claimExtra)}</p>
              </div>
              <div className="col-span-2 rounded-[20px] border border-ivory/10 bg-navy/60 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-ivory/80">Food in the last {c.food.days} days</span>
                  <span className="tnum text-cream-2">{usd(c.food.spent)} <span className="text-ivory/50">/ {usd(c.food.normal)} normal</span></span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy">
                  <motion.div className="h-full rounded-full bg-ivory" initial={false} animate={{ width: `${Math.min(100, (c.food.spent / Math.max(1, c.food.normal)) * 100)}%` }} transition={{ duration: 0.5, ease: EASE }} />
                </div>
                <p className="mt-1.5 text-xs text-ivory/60">Food above your normal grocery spending counts toward the claim.</p>
              </div>
            </div>
          )}
          {c && <div className="mt-5 max-w-md"><Assumptions dark items={[...c.rules, "Simulated with a sandbox banking API"]} /></div>}
          {!live.data && <p className="mt-8 text-ivory/70">Connect the backend to use the card.</p>}
        </div>

        {/* right: the card, places to tap it, and what happened */}
        <div className="w-full max-w-[460px]">
          <motion.div animate={card} className="relative aspect-[1.586] overflow-hidden rounded-[26px] bg-[linear-gradient(135deg,#34507a_0%,#1c2e4a_45%,#0f1a2b_100%)] p-6 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.7)] ring-1 ring-ivory/10">
            <motion.div className="pointer-events-none absolute -inset-y-10 w-24 rotate-12 bg-gradient-to-r from-transparent via-ivory/15 to-transparent"
              animate={{ x: [-120, 520] }} transition={{ duration: 3.5, repeat: Infinity, repeatDelay: 2, ease: "easeInOut" }} />
            <div className="flex items-start justify-between">
              <span className="invert"><Logo width={84} animate={false} id="card-logo" /></span>
              <span className="rounded-full bg-ivory/15 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-cream-2">Essentials only</span>
            </div>
            <div className="absolute inset-x-6 bottom-6 flex items-end justify-between">
              <div>
                <p className="tnum text-lg tracking-[0.2em] text-cream-2/90">•••• {c?.last4 ?? "4821"}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-ivory/60">Recovery card · Maria Garcia</p>
              </div>
              <p className="tnum text-[28px] font-light leading-none">{c && !locked ? usd(c.available) : "—"}</p>
            </div>
            {locked && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-navy/70 backdrop-blur-[2px]">
                <Lock className="h-6 w-6 text-ivory" strokeWidth={1.75} />
                {noFunds || !c ? (
                  <button onClick={() => go("fund")} className="pill bg-cream-2 text-navy hover:bg-white">Take Bridge Funds first <ArrowRight className="h-4 w-4" /></button>
                ) : (
                  <button onClick={activate} disabled={busy === "activate"} className="pill bg-cream-2 text-navy hover:bg-white disabled:opacity-50">Turn on my card</button>
                )}
              </div>
            )}
          </motion.div>

          <AnimatePresence mode="wait">
            {last && (
              <motion.p key={last.text} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={`mt-4 flex items-start gap-2 rounded-[16px] px-4 py-3 text-sm ${last.ok ? "bg-sage/20 text-[#cfe3d4]" : "bg-clay/20 text-[#f0c2b9]"}`}>
                {last.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <X className="mt-0.5 h-4 w-4 shrink-0" />} {last.ok ? "Approved. " : ""}{last.text}
              </motion.p>
            )}
          </AnimatePresence>

          {c && !locked && (
            <>
              <p className="mt-6 text-xs uppercase tracking-[0.2em] text-ivory/60">Try it nearby · tap to pay</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {c.terminal.map((t) => {
                  const Icon = ICON[t.kind] ?? ShoppingBasket;
                  return (
                    <button key={t.id} onClick={() => tap(t.id)} disabled={busy !== null}
                      className="group flex items-center gap-3 rounded-[16px] border border-ivory/10 bg-navy/50 px-3.5 py-3 text-left transition hover:border-ivory/30 hover:bg-navy disabled:opacity-60">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ivory/10"><Icon className="h-4 w-4 text-ivory" strokeWidth={1.75} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-cream-2">{t.merchant}</span>
                        <span className="block text-xs text-ivory/60">{t.what} · {usd(t.amount)}</span>
                      </span>
                      {busy === t.id && <motion.span className="h-2 w-2 rounded-full bg-ivory" animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 0.8, repeat: Infinity }} />}
                    </button>
                  );
                })}
              </div>

              {c.purchases.length > 0 && (
                <>
                  <p className="mt-6 text-xs uppercase tracking-[0.2em] text-ivory/60">Card activity</p>
                  <ul className="mt-3 max-h-[220px] space-y-2 overflow-y-auto pr-1 no-scrollbar">
                    <AnimatePresence initial={false}>
                      {c.purchases.map((p) => (
                        <motion.li key={p.ts + p.merchant + p.amount} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                          className="flex items-center gap-3 rounded-[14px] bg-navy/50 px-4 py-2.5">
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 text-sm text-cream-2">
                              {p.merchant}
                              <span className={`rounded-full px-2 py-px text-[10px] font-medium uppercase tracking-wider ${p.approved ? "bg-sage/25 text-[#cfe3d4]" : "bg-clay/25 text-[#f0c2b9]"}`}>{p.approved ? "Approved" : "Declined"}</span>
                            </span>
                            <span className="block truncate text-xs text-ivory/60">{time(p.ts)}{p.bank_ref ? ` · bank ref ${p.bank_ref.slice(0, 8)}` : ""}</span>
                          </span>
                          <span className="text-right">
                            <span className={`tnum block text-sm ${p.approved ? "text-cream-2" : "text-ivory/50 line-through"}`}>−{usd(p.amount)}</span>
                            {p.added_to_claim > 0 && <span className="tnum block text-xs text-[#cfe3d4]">+{usd(p.added_to_claim)} claim</span>}
                          </span>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
