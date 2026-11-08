"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, CircleAlert, Clock, Phone, ShieldCheck } from "lucide-react";
import { LoomaSays } from "../Cat";
import { useDemo } from "../demo";
import { EASE, Rise } from "../ui";
import { garcias } from "@/lib/mock";
import { shortDate, usd } from "@/lib/format";
import { useLive, type LBill } from "@/lib/live";

type Card = { id: string; name: string; amount: number; due: string; tag: "pay" | "move" | "call"; why: string; action: string; script?: string; mortgage?: boolean };

/** A backend bill as a card, with plain-language why, action and call script. */
function liveCard(b: LBill): Card {
  const due = new Date(Date.now() + b.due_in_days * 86_400_000).toISOString().slice(0, 10);
  const base = { id: b.id, name: b.payee, amount: b.amount, due };
  if (b.kind === "mortgage")
    return { ...base, tag: "call", mortgage: true, why: `Ask for a disaster payment pause. Could save ${usd(b.amount)}.`, action: "Get call script",
      script: "“Our home was damaged in the recent disaster. Do you offer disaster forbearance, and can you waive late fees during the pause?”" };
  if (b.label === "call_about")
    return { ...base, tag: "call", why: "Ask to move the due date until the claim pays.", action: "Get call script",
      script: `“Hi, our home was damaged in a disaster this week. Can you waive fees or move my ${b.payee.toLowerCase()} due date?”` };
  if (b.label === "move") return { ...base, tag: "move", why: "Can wait until the claim pays.", action: "Move to after the payout" };
  return { ...base, tag: "pay", why: "Keeps it current. Late fees are paused while Disaster Mode is on.", action: `Pay ${usd(b.amount)}` };
}

const meta: Record<string, { tag: "pay" | "move" | "call"; why: string; action: string; script?: string }> = {
  b1: { tag: "pay", why: "Missing it hurts your credit. Bridge Funds cover it.", action: "Pay $380" },
  b2: { tag: "call", why: "Carriers often waive fees after disasters.", action: "Get call script", script: "“Hi, our home was damaged in a disaster on Nov 6. Can you waive this month's fees or move the due date?”" },
  b3: { tag: "call", why: "Ask for a disaster payment pause. Could save $1,450.", action: "Get call script", script: "“Our home was damaged in the Nov 6 disaster. Do you offer disaster forbearance for December?”" },
  b4: { tag: "move", why: "Can wait until the claim pays.", action: "Move to Dec 1" },
};
const tag = {
  pay: { label: "Pay now", cls: "bg-clay/20 text-[#8e3a30]", Icon: CircleAlert },
  move: { label: "Move", cls: "bg-amber/25 text-[#7a5a1f]", Icon: Clock },
  call: { label: "Call about", cls: "bg-ivory/70 text-dusty-deep", Icon: Phone },
};

/** Disaster Mode bills: one bill in focus at a time, the rest wait their turn. */
export default function Bills() {
  const { toast, set } = useDemo();
  const live = useLive();
  const [done, setDone] = useState<string[]>([]);
  const [script, setScript] = useState<string | null>(null);
  const cards: Card[] = live.data
    ? live.data.bills.filter((b) => b.label && b.status === "pending").map(liveCard)
    : garcias.bills.map((b) => ({ ...b, ...meta[b.id], mortgage: b.id === "b3" }));
  const left = cards.filter((b) => !done.includes(b.id));
  const current = left[0];

  async function complete(c: Card) {
    if (live.data && !c.mortgage && (c.tag === "pay" || c.tag === "move")) {
      const err = await live.billAction(c.id, c.tag);
      if (err) return toast(err); // e.g. not enough in checking: nothing was paid
    }
    if (c.mortgage) set({ mortgageCalled: true });
    setDone((d) => [...d, c.id]);
    setScript(null);
    toast(`${c.name}: ${script ? "call logged" : c.action}`);
  }

  return (
    <div className="mx-auto flex min-h-full max-w-[760px] flex-col justify-center px-10 pb-28 pt-12">
      <Rise>
        <p className="eyebrow flex items-center gap-2"><ShieldCheck className="h-4 w-4" strokeWidth={1.75} /> Disaster mode · Late fees paused</p>
        <h1 className="headline mt-4 text-[52px]">
          {left.length ? <>{left.length} bills before <span className="text-dusty">the claim pays.</span></> : <>Every bill <span className="text-dusty">has a plan.</span></>}
        </h1>
      </Rise>

      <div className="relative mt-10 h-[260px]">
        <AnimatePresence>
          {left.map((b, i) => {
            const t = tag[b.tag];
            if (i > 2) return null;
            return (
              <motion.div
                key={b.id}
                layout
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: i === 0 ? 1 : 0.6 - i * 0.15, y: i * 18, scale: 1 - i * 0.04, zIndex: 10 - i }}
                exit={{ opacity: 0, x: 120, rotate: 4, transition: { duration: 0.3 } }}
                transition={{ duration: 0.35, ease: EASE }}
                className="absolute inset-x-0 top-0 rounded-[28px] border border-navy/[0.08] bg-cream p-8 shadow-[0_20px_50px_-28px_rgba(15,26,43,0.45)]"
              >
                <div className="flex items-start justify-between">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${t.cls}`}>
                    <t.Icon className="h-4 w-4" strokeWidth={1.75} /> {t.label}
                  </span>
                  <span className="text-dusty-deep">Due {shortDate(b.due)}</span>
                </div>
                <div className="mt-6 flex items-end justify-between">
                  <p className="text-[34px] font-light text-navy">{b.name}</p>
                  <p className="tnum text-[44px] font-light leading-none text-navy">{usd(b.amount)}</p>
                </div>
                <p className="mt-2 text-dusty-deep">{b.why}</p>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {!current && (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex h-full items-center justify-center rounded-[28px] border border-dashed border-midnight/20">
            <p className="flex items-center gap-2 text-lg text-navy"><Check className="h-5 w-5 text-sage" /> Nothing else is due before the payout.</p>
          </motion.div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {script && (
          <motion.div key="script" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 rounded-[20px] bg-midnight p-5 text-cream-2">
            <p className="text-xs uppercase tracking-[0.2em] text-ivory">Say this</p>
            <p className="mt-2 text-lg">{script}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {current && (
        <div className="mt-6 flex gap-3">
          {current.script && !script ? (
            <button onClick={() => setScript(current.script!)} className="pill-dark h-[52px] flex-1 rounded-[14px]">
              {current.action}
            </button>
          ) : (
            <button onClick={() => complete(current)} className="pill-dark h-[52px] flex-1 rounded-[14px]">
              {script ? "I made the call" : current.action}
            </button>
          )}
          <button onClick={() => (setDone((d) => [...d, current.id]), setScript(null))} className="pill-light h-[52px] rounded-[14px]">
            Skip for now
          </button>
        </div>
      )}

      <div className="mt-6">
        <LoomaSays delay={0.5}>I&apos;ll remind you before anything is due.</LoomaSays>
      </div>
    </div>
  );
}
