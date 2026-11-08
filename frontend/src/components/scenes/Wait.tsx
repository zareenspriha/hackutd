"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, CloudRain, RotateCcw } from "lucide-react";
import Cat from "../Cat";
import { useDemo } from "../demo";
import { Assumptions, EASE, Rise, Stage, useNav } from "../ui";
import { forecast } from "@/lib/mock";
import { usd } from "@/lib/format";
import { useLive, type LForecast } from "@/lib/live";

const START = new Date(new Date().setHours(12, 0, 0, 0));
const dayLabel = (d: number) => new Date(START.getTime() + d * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function Wait() {
  const { s, set, toast } = useDemo();
  const { go } = useNav();
  const [weeks, setWeeks] = useState(3);
  const [pays, setPays] = useState(100);
  const live = useLive();
  // Live: a late paycheck is already in the backend forecast, so the slider starts at 0.
  const [missed, setMissed] = useState(s.paycheckDelayed && !live.data ? 2 : 0);
  const [pause, setPause] = useState(false);
  const bridge = 2480;
  const [fc, setFc] = useState<LForecast | null>(null);
  const [topStep, setTopStep] = useState<string | null>(null);

  // Live: the backend forecast for this scenario (debounced while a slider moves).
  useEffect(() => {
    if (!live.data) return;
    const t = setTimeout(() => {
      live.whatIf({ claimDelayDays: weeks * 7, payoutPct: pays / 100, missedWorkDays: missed * 7, mortgagePause: pause }).then((r) => {
        if (!r) return;
        setFc(r.forecast);
        setTopStep(r.next_steps[0]?.title ?? null);
      });
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.data, weeks, pays, missed, pause]);

  const pts = useMemo(() => {
    if (live.data && fc) return fc.days.map((p) => ({ day: p.day, balance: p.balance }));
    const base = forecast(weeks, pays / 100, missed, bridge).map((p) => ({ ...p, balance: p.balance + (s.sisterSent ? 200 : 0) }));
    return pause ? base.map((p) => ({ ...p, balance: p.balance + (p.day >= 53 ? 2900 : p.day >= 23 ? 1450 : 0) })) : base;
  }, [live.data, fc, weeks, pays, missed, pause, s.sisterSent]);

  const low = pts.reduce((m, p) => (p.balance < m.balance ? p : m), pts[0]);
  const short = low.balance < 0;
  // Bridge Funds not taken yet: they're the fix, not the mortgage call.
  const bridgeLeft = live.data && !live.data.bridge.disbursed && live.data.bridge.eligible ? live.data.bridge.amount : 0;
  const bridgeFixes = short && bridgeLeft >= -low.balance;
  const payout = live.data && fc ? fc.expected_payout : Math.round(8420 * (pays / 100));

  const KEY = ["Paycheck", "Car payment", "Mortgage", "Insurance payout", "Bridge Funds repaid automatically"];
  const events = (live.data && fc
    ? fc.days.flatMap((d) =>
        d.events
          .filter((e) => KEY.includes(e.label))
          .map((e) => ({ day: d.day, label: `${e.label} ${e.amount >= 0 ? "+" : "−"}${usd(Math.abs(e.amount))}`, sign: Math.sign(e.amount) })),
      )
    : [
        { day: 0, label: `Bridge Funds +${usd(bridge)}`, sign: 1 },
        { day: 5, label: "Car payment −$380", sign: -1 },
        { day: 14, label: missed >= 2 ? "Paycheck delayed" : "Paycheck +$1,650", sign: missed >= 2 ? 0 : 1 },
        ...(pause ? [] : [{ day: 23, label: "Mortgage −$1,450", sign: -1 }]),
        { day: weeks * 7, label: `Insurance payout +${usd(payout)}`, sign: 1 },
      ]
  ).filter((e) => e.day <= pts[pts.length - 1].day);
  const assumptions = live.data && fc
    ? fc.assumptions
    : ["Essentials $95 a day, hotel $89 a night for 14 nights", "Paycheck $1,650 every two weeks", "Deductible $2,500 comes out of the payout", "Bridge Funds repaid from the payout"];

  const W = 760, H = 280;
  const lo = Math.min(-1500, ...pts.map((p) => p.balance));
  const hi = Math.max(...pts.map((p) => p.balance)) + 600;
  const last = pts[pts.length - 1].day;
  const x = (d: number) => (d / last) * W;
  const y = (b: number) => H - ((b - lo) / (hi - lo)) * H;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.balance).toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const bal = (d: number) => pts.find((p) => p.day === d)?.balance ?? 0;

  return (
    <Stage
      wideRight
      left={
        <>
          <Rise>
            <p className="eyebrow">What if</p>
            <h1 className="headline mt-4 text-[60px]">
              What if the claim <span className="text-dusty">runs late?</span>
            </h1>
            <p className="mt-4 text-lg text-dusty-deep">Move a slider. looma shows if your money lasts.</p>
          </Rise>
          <Rise delay={0.15} className="mt-8 space-y-6">
            <Lever label="Claim takes" value={`${weeks} weeks`} min={1} max={8} v={weeks} set={setWeeks} />
            <Lever label="Insurance pays" value={`${pays}%`} min={50} max={100} step={5} v={pays} set={setPays} />
            <Lever label="Missed work" value={missed ? `${missed} week${missed > 1 ? "s" : ""}` : "none"} min={0} max={4} v={missed} set={setMissed} />
            <div className="flex min-h-[56px] items-center justify-between rounded-[16px] border border-navy/[0.08] bg-cream px-5">
              <span className="text-navy">Pause the mortgage</span>
              <button role="switch" aria-checked={pause} aria-label="Pause the mortgage" onClick={() => setPause(!pause)} className={`relative h-7 w-12 rounded-full transition ${pause ? "bg-midnight" : "bg-ivory"}`}>
                <motion.span layout transition={{ duration: 0.2 }} className={`absolute top-1 h-5 w-5 rounded-full bg-cream-2 ${pause ? "right-1" : "left-1"}`} />
              </button>
            </div>
            <button onClick={() => (setWeeks(3), setPays(100), setMissed(0), setPause(false))} className="inline-flex items-center gap-1.5 text-sm font-medium text-midnight underline underline-offset-4">
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} /> Reset
            </button>
          </Rise>
        </>
      }
      right={
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.32, ease: EASE }} className="overflow-hidden rounded-[24px] border border-navy/[0.08] bg-cream">
          <div className="relative px-8 pb-9 pt-8">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label={`Balance forecast. Tightest day ${dayLabel(low.day)}, ${usd(low.balance)}.`}>
              <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="#52677d" strokeDasharray="4 6" />
              <text x={W} y={y(0) - 8} textAnchor="end" fontSize={13} fill="#3f5266">$0</text>
              <motion.path d={area} fill="#1c2e4a" fillOpacity={0.12} initial={false} animate={{ d: area }} transition={{ duration: 0.3, ease: EASE }} />
              <motion.path d={line} fill="none" stroke="#1c2e4a" strokeWidth={2.5} initial={false} animate={{ d: line }} transition={{ duration: 0.3, ease: EASE }} />
              {/* tight day */}
              <line x1={x(low.day)} x2={x(low.day)} y1={0} y2={H} stroke="#b5574b" strokeWidth={1.5} />
              <text x={x(low.day) - 8} y={14} textAnchor="end" fontSize={13} fill="#8e3a30">Money gets tight {dayLabel(low.day)}</text>
              {events.map((e) => (
                <g key={`${e.day}-${e.label}`}>
                  <circle cx={x(e.day)} cy={y(bal(e.day))} r={5} fill="#f2f1ee" stroke="#1c2e4a" strokeWidth={2}>
                    <title>{e.label}</title>
                  </circle>
                </g>
              ))}
              {[0, 7, 14, 21, 28, 35, 42, 49, 56].filter((d) => d <= last).map((d) => (
                <text key={d} x={x(d)} y={H + 22} fontSize={12} fill="#3f5266" textAnchor={d === 0 ? "start" : "middle"}>{dayLabel(d)}</text>
              ))}
            </svg>
            <motion.div
              className="absolute flex flex-col items-center"
              animate={{ left: `calc(2rem + ${x(low.day) / W} * (100% - 4rem) - 14px)`, top: `calc(2rem + ${y(low.balance) / H} * (100% - 4.25rem) - 60px)` }}
              transition={{ duration: 0.32, ease: EASE }}
            >
              {short && <CloudRain className="mb-1 h-6 w-6 text-clay" strokeWidth={1.75} />}
              <Cat size={26} blink={false} />
            </motion.div>
          </div>

          <div className={`flex items-center justify-between gap-4 px-8 py-5 ${short ? "bg-navy" : "bg-midnight"} text-cream-2`}>
            <p className="text-lg">
              {bridgeFixes ? (
                <>Without help you&apos;d run <b className="font-semibold">{usd(-low.balance)} short</b> on {dayLabel(low.day)}. Your {usd(bridgeLeft)} in Bridge funds covers it.</>
              ) : short ? <>You&apos;d run <b className="font-semibold">{usd(-low.balance)} short</b> on {dayLabel(low.day)}.</> : <>You stay above water. Tightest day is {dayLabel(low.day)} with {usd(low.balance)}.</>}
              <span className="block text-sm text-ivory">
                {live.data && topStep
                  ? <>Your next step would be: {topStep.replace(/\.$/, "")}.</>
                  : <>Your next steps would change: {short ? (pause ? "ask your Help Circle to close the gap." : "call your lender about a mortgage pause moves to #1.") : "no change."}</>}
              </span>
            </p>
            {bridgeFixes && (
              <button onClick={() => go("fund")} className="pill shrink-0 bg-cream-2 text-midnight hover:bg-white">
                Unlock Bridge funds <ArrowRight className="h-4 w-4" />
              </button>
            )}
            {short && !bridgeFixes && !pause && (
              <button onClick={() => (set({ mortgageCalled: true }), setPause(true), toast("Mortgage pause requested"))} className="pill shrink-0 bg-cream-2 text-midnight hover:bg-white">
                Call script <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="px-6 pb-4">
            <Assumptions items={assumptions} />
          </div>
        </motion.div>
      }
    />
  );
}

function Lever({ label, value, min, max, step = 1, v, set }: { label: string; value: string; min: number; max: number; step?: number; v: number; set: (n: number) => void }) {
  return (
    <label className="block">
      <span className="flex justify-between">
        <span className="text-dusty-deep">{label}</span>
        <span className="tnum font-medium text-navy">{value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(+e.target.value)} className="mt-2 h-11 w-full" />
    </label>
  );
}
