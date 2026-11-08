"use client";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Camera, Check, CheckCircle2, Image as ImageIcon, Receipt } from "lucide-react";
import { useDemo } from "../demo";
import { CountUp, EASE, Rise, Stage, useNav } from "../ui";
import { garcias } from "@/lib/mock";
import { usd } from "@/lib/format";
import type { ClaimLine } from "@/lib/types";

const sectionName: Record<ClaimLine["kind"], { label: string; Icon: typeof Receipt }> = {
  belongings: { label: "Belongings", Icon: CheckCircle2 },
  home_damage: { label: "Home damage", Icon: ImageIcon },
  living_expense: { label: "Extra living costs", Icon: Receipt },
};

export default function Claim() {
  const { go } = useNav();
  const { s, set, toast } = useDemo();

  const lines = garcias.claim.filter((c) => (c.id === "c6" ? s.scanAdded : c.id === "c4" ? s.receiptAdded : true));
  const owed = lines.reduce((a, c) => a + c.amount, 0);
  const proven = lines.filter((c) => c.documented).reduce((a, c) => a + c.amount, 0);
  const pct = Math.round((proven / owed) * 100);

  return (
    <Stage
      left={
        <>
          <Rise>
            <p className="eyebrow">Your claim</p>
            <h1 className="headline mt-4 text-[64px]">
              Everything you&apos;re owed, <span className="text-dusty">with proof.</span>
            </h1>
          </Rise>

          <div className="mt-8 max-w-[480px] space-y-4">
            <AnimatePresence mode="wait">
              {!s.receiptAdded ? (
                <motion.button
                  key="snap"
                  exit={{ opacity: 0, y: -8 }}
                  onClick={() => {
                    set({ receiptAdded: true });
                    toast("$90 added to your claim");
                  }}
                  className="flex w-full items-center gap-4 rounded-[20px] border border-navy/[0.08] bg-cream p-5 text-left shadow-[0_1px_2px_rgba(15,26,43,0.06),0_8px_24px_rgba(15,26,43,0.06)] transition hover:bg-cream-2"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-midnight text-cream-2">
                    <Camera className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <span>
                    <span className="block text-lg font-medium text-navy">Snap a receipt</span>
                    <span className="block text-dusty-deep">Meals and hotels you didn&apos;t plan for count too.</span>
                  </span>
                </motion.button>
              ) : (
                <motion.div key="eq" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: EASE }} className="rounded-[20px] border border-navy/[0.08] bg-cream p-5">
                  <div className="flex items-baseline justify-between">
                    <p className="font-medium text-navy">Taquería El Sol · Nov 7</p>
                    <p className="tnum text-dusty-deep">Paid $210</p>
                  </div>
                  <p className="mt-2 text-navy">Only $90 counts. You normally spend $120 a week on groceries, and insurance covers the difference.</p>
                  <div className="mt-4 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 text-center">
                    <Eq n="$210" l="Paid" />
                    <span className="text-2xl text-dusty-deep">−</span>
                    <Eq n="$120" l="Normal week" />
                    <span className="text-2xl text-dusty-deep">=</span>
                    <Eq n="$90" l="Counts" strong />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
              {!s.claimFiled ? (
                <motion.button
                  key="send"
                  exit={{ opacity: 0 }}
                  onClick={() => {
                    set({ claimFiled: true });
                    toast("Claim filed. Next step checked off.");
                  }}
                  className="pill-dark h-[52px] w-full rounded-[14px]"
                >
                  File my claim
                </motion.button>
              ) : (
                <motion.div key="sent" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, ease: EASE }} className="rounded-[20px] bg-midnight p-6 text-cream-2">
                  <p className="inline-flex items-center gap-1.5 rounded-full bg-sage/20 px-2.5 py-1 text-xs font-medium text-[#a9c7b0]">
                    <Check className="h-3.5 w-3.5" /> Claim filed Nov 8
                  </p>
                  <p className="mt-3 text-[28px] font-light leading-tight">Your proof just unlocked {usd(garcias.bridgeFunds.eligible)}.</p>
                  <button onClick={() => go("fund")} className="pill mt-5 bg-cream-2 text-midnight hover:bg-white">
                    Get money now <ArrowRight className="h-4 w-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      }
      right={
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6, ease: EASE }}
          className="relative mx-auto max-w-[560px] rounded-t-[28px] bg-cream-2 px-10 pb-10 pt-8 shadow-[0_40px_80px_-30px_rgba(15,26,43,0.45)]"
        >
          <div className="mb-5 flex items-baseline justify-between border-b border-ivory pb-4">
            <span className="text-2xl font-medium text-midnight">looma.</span>
            <span className="text-sm text-dusty-deep">Claim · Garcia household</span>
          </div>
          {(Object.keys(sectionName) as ClaimLine["kind"][]).map((k) => {
            const ls = lines.filter((l) => l.kind === k);
            const sub = ls.reduce((a, l) => a + l.amount, 0);
            const S = sectionName[k];
            return (
              <div key={k} className="mb-5">
                <div className="flex items-baseline justify-between">
                  <p className="eyebrow flex items-center gap-1.5"><S.Icon className="h-3.5 w-3.5" strokeWidth={1.75} /> {S.label}</p>
                  <p className="tnum text-sm text-dusty-deep">{usd(sub)}</p>
                </div>
                <ul className="mt-1.5">
                  <AnimatePresence initial={false}>
                    {ls.length === 0 && <li className="py-2 text-[15px] text-dusty-deep">No receipts yet. Snap one to add it.</li>}
                    {ls.map((l) => (
                      <motion.li
                        key={l.id}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        transition={{ duration: 0.3, ease: EASE }}
                        className="flex justify-between border-b border-dotted border-ivory py-2.5 text-[16px]"
                      >
                        <span className={l.documented ? "text-navy" : "text-dusty-deep"}>{l.label}</span>
                        <span className="tnum text-navy">{usd(l.amount)}</span>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </div>
            );
          })}
          <div className="flex items-end justify-between pt-1">
            <span className="text-dusty-deep">Owed to you</span>
            <CountUp value={owed} className="text-[52px] font-light leading-none text-midnight" />
          </div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-ivory" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <motion.div className="h-full rounded-full bg-midnight" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: EASE }} />
          </div>
          <div className="mt-2 flex justify-between text-sm">
            <span className="text-dusty-deep">{pct}% documented</span>
            <button onClick={() => go("scan")} className="font-medium text-midnight underline underline-offset-4">Scan the closet to finish</button>
          </div>
          <div className="absolute inset-x-0 -bottom-3 h-3 bg-[linear-gradient(135deg,#f2f1ee_50%,transparent_50%),linear-gradient(225deg,#f2f1ee_50%,transparent_50%)] bg-[size:18px_12px]" />
        </motion.div>
      }
    />
  );
}

function Eq({ n, l, strong = false }: { n: string; l: string; strong?: boolean }) {
  return (
    <div className={`rounded-[14px] px-2 py-3 ${strong ? "bg-midnight text-cream-2" : "bg-cream-2 text-navy"}`}>
      <p className="tnum text-2xl font-light">{n}</p>
      <p className={`text-xs ${strong ? "text-ivory" : "text-dusty-deep"}`}>{l}</p>
    </div>
  );
}
