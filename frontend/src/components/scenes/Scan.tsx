"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Sun } from "lucide-react";
import { Rise, Stage, useNav } from "../ui";
import { scannedItems } from "@/lib/mock";
import { usd } from "@/lib/format";

type Phase = "before" | "after";
type Status = "idle" | "recording" | "done";

// Where each item's tag lands in the viewfinder (percent).
const spots: Record<string, [number, number]> = {
  i1: [14, 26], i2: [52, 16], i3: [66, 56], i4: [10, 62], i5: [40, 42], i6: [34, 74],
};

export default function Scan() {
  const { go } = useNav();
  const [phase, setPhase] = useState<Phase>("before");
  const [status, setStatus] = useState<Status>("idle");
  const [shown, setShown] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [secs, setSecs] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const reset = (p: Phase) => {
    timers.current.forEach(clearTimeout);
    setPhase(p);
    setStatus("idle");
    setShown(0);
    setSecs(0);
    setHint(null);
  };

  // TODO (Scan & CV): replace with real upload -> POST /households/{id}/scan?phase=,
  // OpenCV blur/brightness hints, Gemini item list, before/after comparison.
  function record() {
    setStatus("recording");
    const t = timers.current;
    scannedItems.forEach((_, i) => t.push(setTimeout(() => setShown(i + 1), 700 + i * 600)));
    t.push(setTimeout(() => setHint("Slow down a little"), 1400));
    t.push(setTimeout(() => setHint(null), 2900));
    t.push(setTimeout(() => setStatus("done"), 700 + scannedItems.length * 600 + 300));
  }

  useEffect(() => {
    if (status !== "recording") return;
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [status]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const items = scannedItems.slice(0, shown);
  const losses = phase === "after" ? items.filter((i) => i.condition !== "good") : [];

  return (
    <Stage
      left={
        <>
          <Rise>
            <p className="eyebrow">Living room</p>
            <h1 className="headline mt-4 text-[72px]">
              {phase === "before" ? (
                <>Scan a room. <span className="text-dusty">Remember your home.</span></>
              ) : (
                <>Scan it again. <span className="text-dusty">Show what changed.</span></>
              )}
            </h1>
            <p className="mt-5 max-w-md text-lg text-dusty-deep">
              Walk slowly around the room for 30 seconds. looma lists what you own.
            </p>
          </Rise>

          <Rise delay={0.15} className="glass mt-8 inline-grid grid-cols-2 rounded-full p-1.5 text-sm">
            {(["before", "after"] as Phase[]).map((p) => (
              <button key={p} onClick={() => reset(p)} className="relative rounded-full px-6 py-2.5 font-medium">
                {phase === p && <motion.span layoutId="phase" className="absolute inset-0 rounded-full bg-midnight" />}
                <span className={`relative ${phase === p ? "text-butter" : "text-dusty-deep"}`}>
                  {p === "before" ? "Before" : "After the flood"}
                </span>
              </button>
            ))}
          </Rise>

          <AnimatePresence mode="wait">
            {status === "done" && (
              <motion.div key={phase} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-8">
                {phase === "before" ? (
                  <div className="glass max-w-md p-6">
                    <p className="text-[28px] font-light text-midnight">{items.length} things saved.</p>
                    <p className="mt-1 text-dusty-deep">
                      Saved privately. Only you can share it.
                    </p>
                    <button onClick={() => reset("after")} className="pill-light mt-5">
                      Now scan after the flood <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="max-w-md rounded-[28px] bg-midnight p-6 text-butter">
                    <p className="text-xs font-medium uppercase tracking-[0.22em] text-ivory">First look</p>
                    <p className="mt-2 text-[52px] font-light leading-none">{losses.length} things changed</p>
                    <p className="mt-2 text-ivory">
                      {losses.map((l) => l.name.toLowerCase()).join(" and ")}.
                    </p>
                    <button onClick={() => go("compare")} className="pill mt-5 bg-butter text-midnight hover:bg-white">
                      See what changed <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      }
      right={
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25, duration: 0.7 }}
          className="relative aspect-[4/3] overflow-hidden rounded-[40px] bg-[radial-gradient(120%_90%_at_30%_15%,#52677d,#1c2e4a_55%,#0f1a2b)] shadow-[0_40px_80px_-30px_rgba(15,26,43,0.6)]"
        >
          <div className="absolute inset-0 bg-[linear-gradient(rgba(209,207,201,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(209,207,201,0.06)_1px,transparent_1px)] bg-[size:33.33%_33.33%]" />
          {["left-6 top-6 border-l-2 border-t-2", "right-6 top-6 border-r-2 border-t-2", "left-6 bottom-6 border-l-2 border-b-2", "right-6 bottom-6 border-r-2 border-b-2"].map((c) => (
            <span key={c} className={`absolute h-10 w-10 rounded-sm border-butter/70 ${c}`} />
          ))}

          {status === "recording" && (
            <>
              <motion.div
                className="absolute inset-x-0 h-32 bg-gradient-to-b from-transparent via-ivory/25 to-transparent"
                animate={{ top: ["-25%", "100%"] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
              />
              <div className="absolute left-8 top-8 flex items-center gap-2 rounded-full bg-navy/50 px-4 py-1.5 text-sm font-medium text-butter">
                <motion.span className="h-2 w-2 rounded-full bg-butter" animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1, repeat: Infinity }} />
                REC 0:{String(secs).padStart(2, "0")}
              </div>
            </>
          )}

          <AnimatePresence>
            {hint && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute right-8 top-8 flex items-center gap-2 rounded-full bg-butter px-4 py-1.5 text-sm font-medium text-midnight"
              >
                <Sun className="h-4 w-4" /> {hint}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {items.map((it) => {
              const [x, y] = spots[it.id];
              const lost = phase === "after" && it.condition !== "good";
              return (
                <motion.div
                  key={it.id + phase}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="absolute"
                  style={{ left: `${x}%`, top: `${y}%` }}
                >
                  <div className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium shadow-lg ${lost ? "bg-navy text-butter ring-2 ring-butter/60" : "bg-butter/90 text-midnight"}`}>
                    <span className={it.condition === "missing" && lost ? "line-through" : ""}>{it.name}</span>
                    <span className="ml-2 opacity-60">{lost ? (it.condition === "missing" ? "gone" : "damaged") : usd(it.replacementCost)}</span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {status === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 text-center">
              <p className="text-ivory">{phase === "before" ? "Record the room as it is today" : "Record the same room again"}</p>
              <button onClick={record} aria-label="Start recording" className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-butter/80 transition hover:scale-105">
                <span className="h-16 w-16 rounded-full bg-butter" />
              </button>
            </div>
          )}
        </motion.div>
      }
    />
  );
}
