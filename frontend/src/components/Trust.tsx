"use client";
/**
 * Trust and safety pieces for the family app:
 * - SafetyCheck: "Are you safe?" goes straight to responders and can only move the family up their list.
 * - Messages: what responders sent, signed by name.
 * - TrustPanel: what responders can and can't see, the hardship-sharing choice, and an activity log
 *   with a bank reference for every money move.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Eye, EyeOff, HeartHandshake, Landmark, MessageSquare, ShieldCheck, X } from "lucide-react";
import { useLive, type LActivityView } from "@/lib/live";
import { useDemo } from "./demo";
import { usd } from "@/lib/format";

const EASE = [0.22, 1, 0.36, 1] as const;
const NEEDS: [string, string][] = [
  ["shelter", "A place to stay"], ["food", "Food"], ["cash", "Cash"], ["transport", "A ride"],
  ["medical", "Medical care"], ["power", "Power or phone charging"],
];
const when = (ts: string) =>
  new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function SafetyCheck() {
  const live = useLive();
  const { toast } = useDemo();
  const ci = live.data?.home.check_in;
  const [mode, setMode] = useState<"ask" | "needs" | "done">(ci ? "done" : "ask");
  const [needs, setNeeds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  useEffect(() => setMode(ci ? "done" : "ask"), [ci]);

  if (!live.data) return null;

  async function send(safe: boolean) {
    setSending(true);
    const ok = await live.checkIn(safe, needs);
    setSending(false);
    toast(ok ? (safe ? "Thanks. Responders know you're safe." : "Sent. Responders see this right away.") : "That didn't send. Try again.");
  }

  return (
    <div className="rounded-[22px] border border-navy/[0.08] bg-cream p-5">
      <AnimatePresence mode="wait">
        {mode === "done" && ci ? (
          <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3">
            <span className={`flex h-9 w-9 items-center justify-center rounded-full ${ci.safe && !ci.needs.length ? "bg-sage/25 text-[#3f6248]" : "bg-amber/25 text-[#7a5a1f]"}`}>
              {ci.safe && !ci.needs.length ? <Check className="h-4 w-4" /> : <HeartHandshake className="h-4 w-4" strokeWidth={1.75} />}
            </span>
            <p className="flex-1 text-navy">
              {ci.safe && !ci.needs.length ? "You told responders you're safe." : `Responders know you need ${ci.needs.length ? ci.needs.map((n) => NEEDS.find((x) => x[0] === n)?.[1].toLowerCase() ?? n).join(", ") : "help"}.`}
            </p>
            <button onClick={() => (setNeeds(ci.needs), setMode("ask"))} className="text-sm font-medium text-midnight underline underline-offset-4">Update</button>
          </motion.div>
        ) : mode === "ask" ? (
          <motion.div key="ask" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-4">
            <p className="flex-1 text-[19px] text-navy">Are you and your family safe right now?</p>
            <button disabled={sending} onClick={() => (setNeeds([]), send(true))} className="pill-dark h-11">Yes, we&apos;re safe</button>
            <button onClick={() => setMode("needs")} className="pill h-11 border border-midnight/25 text-midnight hover:bg-cream-2">We need help</button>
          </motion.div>
        ) : (
          <motion.div key="needs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="text-[19px] text-navy">What do you need? Pick any.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {NEEDS.map(([k, label]) => {
                const on = needs.includes(k);
                return (
                  <button key={k} aria-pressed={on} onClick={() => setNeeds((x) => (on ? x.filter((y) => y !== k) : [...x, k]))}
                    className={`h-10 rounded-full border px-4 text-sm ${on ? "border-midnight bg-midnight text-cream-2" : "border-navy/15 text-navy hover:bg-cream-2"}`}>
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button disabled={sending} onClick={() => send(false)} className="pill-dark h-11">Send to responders</button>
              <button onClick={() => setMode(ci ? "done" : "ask")} className="text-sm text-dusty-deep">Cancel</button>
              <p className="ml-auto max-w-[280px] text-xs text-dusty-deep">Responders see this right away. It can only move you up their list. If anyone is hurt, call 911.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Messages() {
  const live = useLive();
  const msgs = live.data?.home.messages ?? [];
  const adj = live.data?.home.assigned_to;
  const m = msgs.find((x) => x.kind !== "assign") ?? msgs[0];
  if (!m && !adj) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}
      className="flex gap-3 rounded-[22px] bg-midnight p-5 text-cream-2">
      <MessageSquare className="mt-0.5 h-5 w-5 shrink-0 text-ivory" strokeWidth={1.75} />
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-ivory">
          {adj ? `${adj} · Your adjuster` : "Your claims team"}{m ? ` · ${when(m.ts)}` : ""}
        </p>
        {m && <p className="mt-1.5 text-[17px] leading-snug">{m.note}</p>}
        <p className="mt-2 text-xs text-ivory/70">Real responders never ask for fees, gift cards or your PIN.</p>
      </div>
    </motion.div>
  );
}

export function TrustPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const live = useLive();
  const [v, setV] = useState<LActivityView | null>(null);
  useEffect(() => {
    if (open) live.activity().then(setV);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, live.data]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] flex justify-end bg-navy/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.aside role="dialog" aria-label="Privacy and activity" initial={{ x: 480 }} animate={{ x: 0 }} exit={{ x: 480 }} transition={{ duration: 0.32, ease: EASE }}
            className="no-scrollbar h-full w-[480px] overflow-y-auto bg-cream-2 p-8">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Privacy and activity</p>
              <button onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-cream"><X className="h-5 w-5" /></button>
            </div>
            <h2 className="mt-3 text-[30px] font-normal leading-tight tracking-tight text-navy">You can see everything that happens to your file.</h2>

            {!v ? (
              <p className="mt-6 text-dusty-deep">{live.data ? "Loading…" : "Connect the backend to see your activity."}</p>
            ) : (
              <>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div className="rounded-[18px] bg-cream p-4">
                    <p className="flex items-center gap-2 text-sm font-medium text-navy"><Eye className="h-4 w-4" strokeWidth={1.75} /> Responders see</p>
                    <ul className="mt-2 space-y-1 text-sm text-dusty-deep">{v.responders_see.map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                  <div className="rounded-[18px] bg-cream p-4">
                    <p className="flex items-center gap-2 text-sm font-medium text-navy"><EyeOff className="h-4 w-4" strokeWidth={1.75} /> They never see</p>
                    <ul className="mt-2 space-y-1 text-sm text-dusty-deep">{v.responders_never_see.map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                </div>

                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-[18px] border border-navy/[0.08] bg-cream p-4">
                  <input type="checkbox" checked={v.share_hardship} onChange={(e) => live.setPrivacy(e.target.checked)} className="mt-1 h-4 w-4 accent-[#1c2e4a]" />
                  <span>
                    <span className="block font-medium text-navy">Let responders know money is tight</span>
                    <span className="block text-sm text-dusty-deep">They see a reason like &ldquo;Savings last 6 days&rdquo;, never a balance. Turning this off can move you down their list.</span>
                  </span>
                </label>

                <p className="eyebrow mt-7">Activity</p>
                <ol className="mt-3 space-y-2">
                  {v.events.length === 0 && <li className="text-dusty-deep">Nothing yet.</li>}
                  {v.events.map((e, i) => (
                    <li key={i} className="flex gap-3 rounded-[16px] bg-cream px-4 py-3">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ivory text-midnight">
                        {e.bank_ref ? <Landmark className="h-3.5 w-3.5" strokeWidth={1.75} /> : e.actor.startsWith("Responder") ? <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex justify-between gap-2 text-sm">
                          <span className="font-medium text-navy">{e.actor}</span>
                          <span className="shrink-0 text-dusty-deep">{when(e.ts)}</span>
                        </span>
                        <span className="block text-[15px] text-navy">
                          {e.text}{e.amount != null && e.bank_ref ? ` · ${e.amount < 0 ? "−" : "+"}${usd(Math.abs(e.amount))}` : ""}
                        </span>
                        {e.bank_ref && <span className="tnum block text-xs text-dusty-deep">Confirmed by your bank · ref {e.bank_ref.slice(0, 10)}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
