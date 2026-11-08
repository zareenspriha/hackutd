"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from "motion/react";
import { ArrowLeft, ArrowRight, ChevronsUpDown, Delete, Landmark, ShieldAlert } from "lucide-react";
import Cat from "../Cat";
import { useDemo } from "../demo";
import { Assumptions, EASE, useNav } from "../ui";
import { api } from "@/lib/api";
import { useLive } from "@/lib/live";
import { usd } from "@/lib/format";

const MOCK_MAX = 2480;
type Step = "amount" | "confirm" | "done";

/**
 * Bridge Funds as one focused flow (dark, like a premium wallet):
 * pick an amount on a numpad → swipe to unlock → the looma card turns over.
 */
export default function Fund() {
  const { s, set, toast } = useDemo();
  const live = useLive();
  const d = live.data;
  const MAX = d ? Math.round(d.bridge.amount) : MOCK_MAX; // the backend caps at the exact offer
  const checking = d ? d.home.checking : 640;
  const { go } = useNav();
  // Done only when nothing is left to draw; after a partial draw the family can take more.
  const allTaken = d ? d.bridge.disbursed && !d.bridge.eligible : s.bridgeTaken;
  const drawnSoFar = d ? d.bridge.drawn : 0;
  const [step, setStep] = useState<Step>(allTaken ? "done" : "amount");
  const [raw, setRaw] = useState(allTaken ? String(MAX) : "");
  const [taken, setTaken] = useState<number | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const amount = Math.min(Number(raw || 0), MAX);
  // Locked until the safety rules pass (claim filed, verified proof). The backend enforces the same rules.
  const locked = !!d && !d.bridge.eligible && !d.bridge.disbursed;
  const presets: [string, number][] = d
    ? (d.bridge.presets ?? [{ label: "Max", amount: MAX }]).map((p) => [p.label, p.amount])
    : [["2 weeks of essentials", 840], ["Max", MAX]];

  function press(k: string) {
    if (k === "del") return setRaw((r) => r.slice(0, -1));
    setRaw((r) => {
      const n = (r + k).replace(/^0+/, "");
      return Number(n) > MAX ? String(MAX) : n.slice(0, 4);
    });
  }

  useEffect(() => {
    if (step !== "amount") return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      if (e.key === "Backspace") press("del");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // re-bind when the live limit arrives so typing is capped at the real amount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, MAX]);

  return (
    <div className="flex min-h-full items-center justify-center bg-[radial-gradient(70%_60%_at_50%_0%,#24395a,#0f1a2b_70%)] px-10 pb-24 pt-10 text-cream-2">
      <div className="grid w-full max-w-[1000px] grid-cols-[1fr_380px] items-center gap-16">
        {/* left: the why, one thing at a time */}
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-ivory/70">Bridge funds</p>
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3, ease: EASE }}>
              {step === "amount" && locked && (
                <>
                  <h1 className="mt-4 text-[52px] font-light leading-[1] tracking-[-0.03em]">Almost there. <span className="text-ivory/60">File your claim first.</span></h1>
                  <p className="mt-5 max-w-md text-lg text-ivory/80">{d!.bridge.reason}</p>
                  <button onClick={() => go("claim")} className="pill mt-6 bg-cream-2 text-midnight hover:bg-white">Open my claim <ArrowRight className="h-4 w-4" /></button>
                  <div className="mt-6 max-w-md"><Assumptions dark items={d!.bridge.rules ?? []} /></div>
                </>
              )}
              {step === "amount" && !locked && (
                <>
                  <h1 className="mt-4 text-[52px] font-light leading-[1] tracking-[-0.03em]">How much do <span className="text-ivory/60">you need now?</span></h1>
                  <p className="mt-5 max-w-md text-lg text-ivory/80">
                    {drawnSoFar
                      ? <>You&apos;ve taken {usd(drawnSoFar)}. {usd(MAX)} more is available. It all repays itself when the insurance pays.</>
                      : <>Your proven claim unlocks up to {usd(MAX)}. It repays itself when the insurance pays. No interest.</>}
                  </p>
                  <div className="mt-4 max-w-md"><Assumptions dark items={d
                    ? [`40% of verified losses (${usd(d.bridge.limits.forty_pct_of_losses)})`, `60 days of essentials (${usd(d.bridge.limits.sixty_days_essentials)})`,
                       ...(d.bridge.limits.half_of_payout != null ? [`Half of your expected payout (${usd(d.bridge.limits.half_of_payout)})`] : []),
                       `Capped at ${usd(d.bridge.limits.cap)}. The lowest one sets your limit${d.bridge.limited_by ? `: ${d.bridge.limited_by}` : ""}`,
                       ...(d.bridge.held_for_review?.length ? [`Waiting on an adjuster, not counted yet: ${d.bridge.held_for_review.join(", ")}`] : []),
                       "Simulated with a sandbox banking API"]
                    : ["40% of proven losses ($6,200)", "Capped at 60 days of essentials or $5,000", "Simulated with a sandbox banking API"]} /></div>
                </>
              )}
              {step === "confirm" && (
                <>
                  <h1 className="mt-4 text-[52px] font-light leading-[1] tracking-[-0.03em]">One swipe <span className="text-ivory/60">and it&apos;s yours.</span></h1>
                  <ol className="mt-6 space-y-3 text-lg text-ivory/85">
                    <li>1 · ${amount.toLocaleString()} lands in checking now</li>
                    <li>2 · Use it for essentials</li>
                    <li>3 · Repaid automatically from the payout. No interest, no fees</li>
                  </ol>
                  <p className="mt-5 max-w-md text-sm text-ivory/60">Every draw is logged with a bank reference in your activity. Real banks never ask for a fee or your PIN to release this.</p>
                </>
              )}
              {step === "done" && (
                <>
                  <h1 className="mt-4 text-[52px] font-light leading-[1] tracking-[-0.03em]">It&apos;s in your <span className="text-ivory/60">checking account.</span></h1>
                  <p className="mt-5 max-w-md text-lg text-ivory/80">Nothing to remember. When the insurance payout arrives, looma repays this first.</p>
                  <div className="mt-8 flex gap-3">
                    <button onClick={() => go("bills")} className="pill bg-cream-2 text-navy hover:bg-white">Plan my bills <ArrowRight className="h-4 w-4" /></button>
                    {d?.bridge.eligible ? (
                      <button onClick={() => (setRaw(""), setTaken(null), setStep("amount"))} className="pill border border-ivory/25 text-cream-2 hover:bg-ivory/10">Take more ({usd(d.bridge.remaining)} left)</button>
                    ) : (
                      <button onClick={() => go("ask")} className="pill border border-ivory/25 text-cream-2 hover:bg-ivory/10">Ask before spending</button>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* right: the device-like panel */}
        <div className="relative h-[620px] overflow-hidden rounded-[40px] border border-ivory/10 bg-navy/70 p-6 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.6)] backdrop-blur">
          <div className="flex items-center justify-between text-sm text-ivory/80">
            {step === "confirm" ? (
              <button onClick={() => setStep("amount")} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-ivory/10"><ArrowLeft className="h-5 w-5" /></button>
            ) : <span className="w-10" />}
            <span>{step === "done" ? "Done" : "Bridge funds"}</span>
            <span className="w-10" />
          </div>

          <AnimatePresence mode="wait">
            {step !== "done" ? (
              <motion.div key="flow" exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.25 }} className="flex h-[calc(100%-40px)] flex-col">
                <Amount value={amount} />
                <div className="mx-auto mt-2 flex flex-wrap justify-center gap-2">
                  {!locked && presets.map(([l, v]) => (
                    <button key={l} onClick={() => setRaw(String(Math.min(v, MAX)))} disabled={step !== "amount"} title={usd(v)} className={`rounded-full px-3 py-1.5 text-xs transition ${amount === v ? "bg-cream-2 text-navy" : "bg-midnight text-ivory hover:bg-raised"}`}>
                      {l}
                    </button>
                  ))}
                </div>
                <div className="mx-auto mt-5 flex items-center gap-2 rounded-full bg-midnight px-4 py-2.5 text-sm">
                  <span className="text-ivory">To</span> checking ••4821 <span className="text-ivory/70">{usd(checking)}</span>
                  <ChevronsUpDown className="h-4 w-4 text-ivory/60" />
                </div>

                <div className="mt-auto">
                  {step === "amount" ? (
                    <>
                      <div className="grid grid-cols-3 gap-1">
                        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((k) =>
                          k ? (
                            <button key={k} onClick={() => press(k)} aria-label={k === "del" ? "Delete" : k} className="flex h-14 items-center justify-center rounded-[16px] text-2xl text-cream-2 transition hover:bg-ivory/10 active:scale-95">
                              {k === "del" ? <Delete className="h-6 w-6" strokeWidth={1.5} /> : k}
                            </button>
                          ) : <span key="blank" />,
                        )}
                      </div>
                      <button disabled={!amount} onClick={() => setStep("confirm")} className="mt-3 h-[52px] w-full rounded-[14px] bg-cream-2 font-medium text-navy transition disabled:opacity-30">
                        {locked ? "Locked until your claim is filed" : "Continue"}
                      </button>
                    </>
                  ) : (
                    <Swipe
                      onDone={async () => {
                        setTaken(amount);
                        if (d) {
                          const r = await live.takeBridge(amount);
                          if (!r) {
                            toast("That didn't go through. Nothing was moved.");
                            setTaken(null);
                            return setStep("amount");
                          }
                          setRef(r.ref);
                        } else await api.unlockBridgeFunds();
                        set({ bridgeTaken: true });
                        toast("It's in your checking account.");
                        setStep("done");
                      }}
                    />
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div key="done" className="flex h-[calc(100%-40px)] flex-col items-center justify-center">
                <CardReveal amount={taken ?? (d ? d.bridge.drawn : amount || MAX)} />
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }} className="mt-8 text-center text-ivory/80">
                  Checking now <span className="tnum text-cream-2">${Math.round(d ? checking : checking + (amount || MAX)).toLocaleString()}</span>
                </motion.p>
                {ref && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }} className="tnum mt-2 flex items-center gap-1.5 text-xs text-ivory/60">
                    <Landmark className="h-3.5 w-3.5" strokeWidth={1.75} /> Confirmed by your bank · ref {ref.slice(0, 10)}
                  </motion.p>
                )}
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }} className="mt-6 flex max-w-[320px] gap-2 rounded-[14px] bg-ivory/10 px-4 py-3 text-xs text-ivory/80">
                  <ShieldAlert className="h-4 w-4 shrink-0" strokeWidth={1.75} /> Scam shield: no one from looma, your bank or your insurer will ask you to send this money anywhere.
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/** Big amount; each new digit blurs in like a rolling counter. */
function Amount({ value }: { value: number }) {
  const str = "$" + value.toLocaleString("en-US");
  return (
    <div className="mt-14 flex h-24 items-center justify-center" aria-live="polite" aria-label={str}>
      {str.split("").map((ch, i) => (
        <AnimatePresence key={i} mode="popLayout" initial={false}>
          <motion.span
            key={ch + i + str.length}
            initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -18, filter: "blur(8px)" }}
            transition={{ duration: 0.28, ease: EASE }}
            className={`tnum inline-block font-medium tracking-tight ${value ? "text-cream-2" : "text-ivory/40"} ${str.length > 6 ? "text-[64px]" : "text-[76px]"}`}
          >
            {ch}
          </motion.span>
        </AnimatePresence>
      ))}
    </div>
  );
}

function Swipe({ onDone }: { onDone: () => void }) {
  const track = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const fill = useTransform(x, (v) => v + 56);
  const label = useTransform(x, [0, 160], [1, 0]);
  const [locked, setLocked] = useState(false);
  return (
    <div ref={track} className="relative h-16 overflow-hidden rounded-full bg-midnight">
      <motion.div className="absolute inset-y-0 left-0 rounded-full bg-raised" style={{ width: fill }} />
      <motion.span style={{ opacity: label }} className="absolute inset-0 flex items-center justify-center text-ivory/80">Swipe to unlock</motion.span>
      <motion.button
        drag={locked ? false : "x"}
        dragConstraints={track}
        dragElastic={0}
        dragMomentum={false}
        style={{ x }}
        onDragEnd={() => {
          const max = (track.current?.offsetWidth ?? 300) - 64;
          if (x.get() > max * 0.8) {
            setLocked(true);
            animate(x, max, { duration: 0.2 }).then(onDone);
          } else animate(x, 0, { duration: 0.3, ease: EASE });
        }}
        onKeyDown={(e) => e.key === "Enter" && onDone()}
        aria-label="Swipe to unlock Bridge Funds"
        className="absolute left-1 top-1 flex h-14 w-14 cursor-grab items-center justify-center rounded-full bg-cream-2 text-navy active:cursor-grabbing"
      >
        <ArrowRight className="h-5 w-5" />
      </motion.button>
    </div>
  );
}

/** The looma card turns over to show the deposit. */
function CardReveal({ amount }: { amount: number }) {
  return (
    <div style={{ perspective: 900 }}>
      <motion.div
        initial={{ rotateY: 180, y: 30, opacity: 0 }}
        animate={{ rotateY: 0, y: 0, opacity: 1 }}
        transition={{ duration: 0.9, ease: EASE }}
        className="relative h-[200px] w-[316px] overflow-hidden rounded-[22px] bg-[linear-gradient(135deg,#24395a,#0f1a2b_60%,#1c2e4a)] p-5 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)] ring-1 ring-ivory/15"
      >
        <motion.div className="absolute -inset-x-10 top-0 h-full -skew-x-12 bg-gradient-to-r from-transparent via-ivory/15 to-transparent" initial={{ x: -320 }} animate={{ x: 360 }} transition={{ delay: 0.7, duration: 1.1, ease: EASE }} />
        <div className="flex items-start justify-between">
          <span className="text-lg font-medium text-cream-2">looma.</span>
          <Cat size={22} light blink={false} />
        </div>
        <p className="mt-9 text-xs uppercase tracking-[0.2em] text-ivory/70">Bridge funds deposited</p>
        <p className="tnum text-[34px] font-medium text-cream-2">${amount.toLocaleString()}</p>
        <div className="mt-1 flex justify-between text-xs text-ivory/70">
          <span>checking ••4821</span>
          <span>repaid from payout</span>
        </div>
      </motion.div>
      <svg viewBox="0 0 24 24" className="mx-auto mt-6 h-10 w-10 text-sage" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
        <circle cx="12" cy="12" r="10" opacity={0.35} />
        <motion.path d="M7 12.5l3.2 3.2L17 9" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.9, duration: 0.32, ease: EASE }} />
      </svg>
    </div>
  );
}
