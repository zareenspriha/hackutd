"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeftRight, Check, CheckCircle2, CircleDashed, CircleHelp, Droplets, MoveRight } from "lucide-react";
import RoomScene from "../RoomScene";
import { useDemo } from "../demo";
import { EASE, Rise, Stage, useNav } from "../ui";
import { compareItems, type CItem } from "@/lib/demoData";
import { usd } from "@/lib/format";
import { frameUrl, useLive, type LCompare, type LCompareItem } from "@/lib/live";
import { Trash2 } from "lucide-react";

type Mode = "side" | "slider" | "changes";
const STEPS = ["Finding your items", "Matching with your last scan", "Checking for damage", "Estimating values"];

const tone: Record<CItem["status"], { label: string; stroke: string; dash?: string; chip: string; Icon: typeof Check }> = {
  damaged: { label: "Damaged", stroke: "#b5574b", chip: "bg-clay text-cream-2", Icon: Droplets },
  missing: { label: "Missing", stroke: "#8a93a3", dash: "4 3", chip: "bg-slate text-navy", Icon: CircleDashed },
  moved: { label: "Moved", stroke: "#c99a4a", chip: "bg-amber text-navy", Icon: MoveRight },
  review: { label: "Needs review", stroke: "#c99a4a", dash: "2 3", chip: "bg-amber/80 text-navy", Icon: CircleHelp },
  unchanged: { label: "Unchanged", stroke: "#6e9277", chip: "bg-sage text-cream-2", Icon: CheckCircle2 },
};

export default function Compare() {
  const { data } = useLive();
  return data ? <LiveCompare /> : <MockCompare />;
}

function MockCompare() {
  const { go } = useNav();
  const { s, set, toast } = useDemo();
  const [processing, setProcessing] = useState(!s.scanAdded);
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<Mode>("side");
  const [review, setReview] = useState<"open" | "yes" | "no">("open");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => setStep((x) => x + 1), 800);
    const done = setTimeout(() => setProcessing(false), 3300);
    return () => (clearInterval(t), clearTimeout(done));
  }, [processing]);

  const items = compareItems.map((i) => (i.id === "lamp" && review === "yes" ? { ...i, status: "damaged" as const, damageType: "Water at the base", severity: 1 as const } : i.id === "lamp" && review === "no" ? { ...i, status: "unchanged" as const } : i));
  const count = (st: CItem["status"]) => items.filter((i) => i.status === st).length;
  // Live: the button adds the real losses from your scans that you haven't confirmed yet.
  const { data: d } = useLive();
  const pending = d?.claim.losses.filter((l) => !l.confirmed) ?? [];
  const toClaim = d && pending.length ? pending : items.filter((i) => i.status === "damaged" || i.status === "missing");
  const claimTotal = d && pending.length ? pending.reduce((a, l) => a + l.replacement_cost, 0) : items.filter((i) => i.status === "damaged" || i.status === "missing").reduce((a, i) => a + i.rc, 0);

  return (
    <Stage
      left={
        <>
          <Rise>
            <p className="eyebrow">Living room · Before and after</p>
            <h1 className="headline mt-4 text-[60px]">
              What <span className="text-dusty">changed.</span>
            </h1>
          </Rise>

          {processing ? (
            <div className="mt-8 h-[46vh]" />
          ) : (
            <>
              <Rise delay={0.05} className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-[15px] text-dusty-deep">
                <span><b className="font-semibold text-navy">{count("damaged")}</b> damaged</span>·
                <span><b className="font-semibold text-navy">{count("missing")}</b> missing</span>·
                <span><b className="font-semibold text-navy">{count("moved")}</b> moved</span>·
                <span><b className="font-semibold text-navy">{count("unchanged")}</b> unchanged</span>
              </Rise>

              <Rise delay={0.1} className="no-scrollbar mt-5 max-h-[44vh] space-y-3 overflow-y-auto pb-2 pr-1">
                {(showAll ? (["damaged", "missing", "review", "moved", "unchanged"] as const) : (["damaged", "missing", "review"] as const)).map((g) => {
                  const list = items.filter((i) => i.status === g);
                  if (!list.length) return null;
                  return (
                    <div key={g}>
                      <p className="eyebrow mb-2">{tone[g].label}</p>
                      <div className="space-y-2">
                        {list.map((it) => (
                          <ItemCard key={it.id} it={it} onReview={setReview} />
                        ))}
                      </div>
                    </div>
                  );
                })}
                <button onClick={() => setShowAll(!showAll)} className="mt-1 text-sm font-medium text-midnight underline underline-offset-4">
                  {showAll ? "Show only what changed" : `Show all ${items.length} items`}
                </button>
              </Rise>

              <Rise delay={0.2} className="mt-4">
                <button
                  onClick={() => {
                    set({ scanAdded: true });
                    toast(`${toClaim.length} items added to your claim`);
                    go("claim");
                  }}
                  className="pill-dark h-[52px] w-full rounded-[14px]"
                >
                  {s.scanAdded ? "Added to your claim" : `Add ${toClaim.length} items to my claim · ${usd(claimTotal)}`}
                </button>
              </Rise>
            </>
          )}
        </>
      }
      right={
        <AnimatePresence mode="wait">
          {processing ? (
            <motion.div key="proc" exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="relative aspect-[16/10] overflow-hidden rounded-[32px]">
              <RoomScene phase="after" className="h-full w-full scale-105 blur-md" />
              <div className="absolute inset-0 bg-midnight/40" />
              <motion.div className="absolute inset-x-0 h-28 bg-gradient-to-b from-transparent via-ivory/40 to-transparent" animate={{ top: ["-20%", "100%"] }} transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }} />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-cream-2">
                <AnimatePresence mode="wait">
                  <motion.p key={step % STEPS.length} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }} className="text-[28px] font-light">
                    {STEPS[step % STEPS.length]}…
                  </motion.p>
                </AnimatePresence>
                <div className="mt-5 flex gap-1.5">
                  {STEPS.map((_, i) => (
                    <span key={i} className={`h-1.5 w-8 rounded-full ${i <= step % STEPS.length ? "bg-cream-2" : "bg-cream-2/30"}`} />
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="res" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.32 }}>
              <div className="glass mb-4 inline-flex rounded-full p-1.5 text-sm" role="tablist">
                {([["side", "Side by side"], ["slider", "Slider"], ["changes", "Changes"]] as const).map(([k, l]) => (
                  <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className="relative rounded-full px-5 py-2 font-medium">
                    {mode === k && <motion.span layoutId="cmp-mode" className="absolute inset-0 rounded-full bg-midnight" transition={{ duration: 0.28, ease: EASE }} />}
                    <span className={`relative ${mode === k ? "text-cream-2" : "text-dusty-deep"}`}>{l}</span>
                  </button>
                ))}
              </div>
              <AnimatePresence mode="wait">
                <motion.div key={mode} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}>
                  {mode === "side" && (
                    <div className="grid grid-cols-2 gap-3">
                      <Frame label="Before · Nov 2" phase="before" items={items} boxes="before" />
                      <Frame label="After · Nov 8" phase="after" items={items} boxes="after" />
                    </div>
                  )}
                  {mode === "slider" && <Slider items={items} />}
                  {mode === "changes" && <Frame label="Changes" phase="after" items={items} boxes="after" heat />}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      }
    />
  );
}

function Boxes({ items, which }: { items: CItem[]; which: "before" | "after" }) {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
      {items.map((it) => {
        const t = tone[it.status];
        const b = which === "before" ? it.beforeBox ?? it.box : it.box;
        if (which === "before" && it.status === "missing") return <rect key={it.id} x={b.x * 100} y={b.y * 100} width={b.w * 100} height={b.h * 100} rx={1} fill="none" stroke="#6e9277" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />;
        return <rect key={it.id} x={b.x * 100} y={b.y * 100} width={b.w * 100} height={b.h * 100} rx={1} fill="none" stroke={which === "before" ? "#6e9277" : t.stroke} strokeWidth={2} strokeDasharray={which === "after" ? t.dash : undefined} vectorEffect="non-scaling-stroke" />;
      })}
    </svg>
  );
}

function Tags({ items }: { items: CItem[] }) {
  return (
    <>
      {items.filter((i) => i.status !== "unchanged").map((it) => {
        const t = tone[it.status];
        return (
          <span key={it.id} className={`absolute -translate-y-full rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${t.chip}`} style={{ left: `${it.box.x * 100}%`, top: `${it.box.y * 100}%` }}>
            {t.label}
          </span>
        );
      })}
    </>
  );
}

function Frame({ label, phase, items, boxes, heat = false }: { label: string; phase: "before" | "after"; items: CItem[]; boxes: "before" | "after"; heat?: boolean }) {
  return (
    <div>
      <div className="relative aspect-[16/10] overflow-hidden rounded-[24px] shadow-[0_24px_50px_-28px_rgba(15,26,43,0.6)]">
        <RoomScene phase={phase} className="h-full w-full" />
        {heat && (
          <div className="absolute inset-0">
            {items.filter((i) => i.status === "damaged" || i.status === "missing").map((it) => (
              <span key={it.id} className="absolute rounded-full" style={{ left: `${(it.box.x - 0.05) * 100}%`, top: `${(it.box.y - 0.08) * 100}%`, width: `${(it.box.w + 0.1) * 100}%`, height: `${(it.box.h + 0.16) * 100}%`, background: "radial-gradient(closest-side, rgba(181,87,75,0.45), rgba(201,154,74,0.3) 60%, transparent)" }} />
            ))}
          </div>
        )}
        <Boxes items={items} which={boxes} />
        {boxes === "after" && <Tags items={items} />}
      </div>
      <p className="mt-2 text-sm text-dusty-deep">{label}</p>
    </div>
  );
}

function Slider({ items }: { items: CItem[] }) {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const drag = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };
  return (
    <div>
      <div
        ref={ref}
        className="relative aspect-[16/10] cursor-ew-resize touch-none select-none overflow-hidden rounded-[24px] shadow-[0_24px_50px_-28px_rgba(15,26,43,0.6)]"
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag(e.clientX); }}
        onPointerMove={(e) => e.buttons && drag(e.clientX)}
      >
        <RoomScene phase="after" className="absolute inset-0 h-full w-full" />
        <Boxes items={items} which="after" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <RoomScene phase="before" className="h-full w-full" />
        </div>
        <div className="absolute inset-y-0 w-0.5 bg-cream-2" style={{ left: `${pos}%` }}>
          <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-cream-2 text-midnight shadow-lg">
            <ArrowLeftRight className="h-5 w-5" strokeWidth={1.75} />
          </span>
        </div>
        <span className="absolute left-4 top-4 rounded-full bg-navy/60 px-3 py-1 text-xs text-cream-2">Before</span>
        <span className="absolute right-4 top-4 rounded-full bg-navy/60 px-3 py-1 text-xs text-cream-2">After</span>
      </div>
      <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(+e.target.value)} className="sr-only" aria-label="Compare before and after" />
      <p className="mt-2 text-sm text-dusty-deep">Drag to compare</p>
    </div>
  );
}

function ItemCard({ it, onReview }: { it: CItem; onReview: (v: "yes" | "no") => void }) {
  const t = tone[it.status];
  if (it.status === "review")
    return (
      <div className="rounded-[20px] border border-amber/50 bg-amber/15 p-4">
        <div className="flex items-center gap-3">
          <Crops it={it} />
          <div className="flex-1">
            <p className="font-medium text-navy">{it.name}</p>
            <p className="text-sm text-dusty-deep">We are not sure. Is this damaged?</p>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => onReview("yes")} className="h-11 rounded-full bg-midnight px-4 text-sm text-cream-2">Yes</button>
            <button onClick={() => onReview("no")} className="h-11 rounded-full border border-midnight/30 px-4 text-sm text-midnight">No</button>
          </div>
        </div>
      </div>
    );
  return (
    <motion.div layout className="rounded-[20px] border border-navy/[0.08] bg-cream p-4 shadow-[0_1px_2px_rgba(15,26,43,0.06),0_8px_24px_rgba(15,26,43,0.06)]">
      <div className="flex items-start gap-3">
        <Crops it={it} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-medium text-navy">{it.name}</p>
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${t.chip}`}>
              <t.Icon className="h-3.5 w-3.5" strokeWidth={1.75} /> {it.status === "moved" ? "Moved, not damaged" : it.damageType ?? t.label}
            </span>
          </div>
          {it.evidence && <p className="mt-1 text-sm text-dusty-deep">{it.evidence}</p>}
          <div className="mt-1.5 flex items-center gap-3 text-xs text-dusty-deep">
            {it.severity !== undefined && (
              <span className="flex items-center gap-1" aria-label={`Severity ${it.severity} of 3`}>
                {[1, 2, 3].map((n) => <span key={n} className={`h-1.5 w-1.5 rounded-full ${n <= it.severity! ? "bg-clay" : "bg-ivory"}`} />)}
              </span>
            )}
            
            {(it.status === "damaged" || it.status === "missing") && <span className="tnum">Replacement {usd(it.rc)}</span>}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Crops({ it }: { it: CItem }) {
  if (it.status === "unchanged") return <RoomScene phase="after" crop={it.box} className="h-12 w-12 shrink-0 rounded-xl" />;
  return (
    <div className="flex shrink-0 gap-1">
      <RoomScene phase="before" crop={it.beforeBox ?? it.box} className="h-14 w-14 rounded-xl" />
      <RoomScene phase="after" crop={it.box} className="h-14 w-14 rounded-xl" />
    </div>
  );
}

/* ---------------- live: the family's real scans ---------------- */

const liveTone: Record<LCompareItem["status"], { label: string; chip: string; Icon: typeof Check }> = {
  destroyed: { label: "Destroyed", chip: "bg-clay text-cream-2", Icon: Droplets },
  damaged: { label: "Damaged", chip: "bg-clay text-cream-2", Icon: Droplets },
  missing: { label: "Missing", chip: "bg-slate text-navy", Icon: CircleDashed },
  unchanged: { label: "Unchanged", chip: "bg-sage text-cream-2", Icon: CheckCircle2 },
};

function LiveCompare() {
  const live = useLive();
  const { go } = useNav();
  const { toast } = useDemo();
  const [c, setC] = useState<LCompare | null>(null);
  const [room, setRoom] = useState<string | undefined>();
  const [mode, setMode] = useState<"side" | "slider">("side");
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    live.compare(room).then((r) => r && setC(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, live.data]);

  if (!c) return <div className="flex h-full items-center justify-center text-dusty-deep">Loading your rooms…</div>;

  if (!c.room || !c.items)
    return (
      <Stage
        left={
          <Rise>
            <p className="eyebrow">Before and after</p>
            <h1 className="headline mt-4 text-[60px]">Nothing to compare <span className="text-dusty">yet.</span></h1>
            <p className="mt-4 text-lg text-dusty-deep">Record a room before and after the flood. looma lines them up here.</p>
            <button onClick={() => go("scan")} className="pill-dark mt-8">Scan a room</button>
          </Rise>
        }
        right={<div />}
      />
    );

  const changed = c.items.filter((i) => i.status !== "unchanged");
  const list = showAll ? c.items : changed;
  const counts = (["destroyed", "damaged", "missing", "unchanged"] as const)
    .map((st) => [st, c.items!.filter((i) => i.status === st).length] as const)
    .filter(([, n]) => n);

  async function addAll() {
    setBusy(true);
    await live.confirmRoom(c!.room!);
    toast(`${changed.length} item${changed.length === 1 ? "" : "s"} added to your claim`);
    setBusy(false);
    go("claim");
  }
  async function notDamaged(i: LCompareItem) {
    if (i.loss_index == null) return;
    await live.removeLoss(i.loss_index);
    toast(`${i.name} removed from your claim`);
    setC(await live.compare(c!.room!));
  }

  return (
    <Stage
      left={
        <>
          <Rise>
            <p className="eyebrow">{c.room} · Before and after</p>
            <h1 className="headline mt-4 text-[60px]">
              What <span className="text-dusty">changed.</span>
            </h1>
          </Rise>
          {c.rooms.length > 1 && (
            <Rise delay={0.05} className="mt-5 flex flex-wrap gap-1.5">
              {c.rooms.map((r) => (
                <button key={r} onClick={() => setRoom(r)} className={`h-9 rounded-full px-4 text-sm transition ${r === c.room ? "bg-midnight text-cream-2" : "bg-cream-2/70 text-dusty-deep hover:text-navy"}`}>
                  {r}
                </button>
              ))}
            </Rise>
          )}
          <Rise delay={0.08} className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[15px] text-dusty-deep">
            {counts.map(([st, n]) => (
              <span key={st}><b className="font-semibold text-navy">{n}</b> {liveTone[st].label.toLowerCase()}</span>
            ))}
          </Rise>

          <Rise delay={0.1} className="no-scrollbar mt-4 max-h-[40vh] space-y-2 overflow-y-auto pb-2 pr-1">
            {list.length === 0 && <p className="text-dusty-deep">Nothing in this room changed. Nothing to add to your claim.</p>}
            {list.map((it) => {
              const t = liveTone[it.status];
              return (
                <motion.div layout key={it.name} className="flex items-center gap-3 rounded-[20px] border border-navy/[0.08] bg-cream p-3 shadow-[0_1px_2px_rgba(15,26,43,0.06),0_8px_24px_rgba(15,26,43,0.06)]">
                  {c.has_video ? (
                    <div className="flex shrink-0 gap-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={frameUrl(c.room!, "before", it.before_ts)} alt={`${it.name} before`} className="h-14 w-14 rounded-xl object-cover" />
                      {it.status !== "unchanged" && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={frameUrl(c.room!, "after", it.after_ts ?? it.before_ts)} alt={`${it.name} after`} className="h-14 w-14 rounded-xl object-cover" />
                      )}
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium text-navy">{it.name}</p>
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${t.chip}`}>
                        <t.Icon className="h-3.5 w-3.5" strokeWidth={1.75} /> {t.label}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-sm text-dusty-deep">
                      <span className="tnum">{it.status === "unchanged" ? "Still there" : `Replacement ${usd(it.replacement_cost)}`}</span>
                      {it.status !== "unchanged" && it.loss_index != null && (
                        <button onClick={() => notDamaged(it)} className="inline-flex items-center gap-1 text-xs font-medium text-midnight underline underline-offset-4">
                          <Trash2 className="h-3 w-3" /> Not a loss
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
            {c.items.length > changed.length && (
              <button onClick={() => setShowAll(!showAll)} className="mt-1 text-sm font-medium text-midnight underline underline-offset-4">
                {showAll ? "Show only what changed" : `Show all ${c.items.length} items`}
              </button>
            )}
          </Rise>

          {changed.length > 0 && (
            <Rise delay={0.2} className="mt-4">
              <button onClick={addAll} disabled={busy || !c.unconfirmed} className="pill-dark h-[52px] w-full rounded-[14px] disabled:opacity-60">
                {c.unconfirmed ? `Add ${changed.length} item${changed.length === 1 ? "" : "s"} to my claim · ${usd(c.loss_total ?? 0)}` : "Already in your claim"}
              </button>
            </Rise>
          )}
        </>
      }
      right={
        c.has_video ? (
          <div>
            <div className="glass mb-4 inline-flex rounded-full p-1.5 text-sm" role="tablist">
              {([["side", "Side by side"], ["slider", "Slider"]] as const).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className="relative rounded-full px-5 py-2 font-medium">
                  {mode === k && <motion.span layoutId="cmp-mode-live" className="absolute inset-0 rounded-full bg-midnight" transition={{ duration: 0.28, ease: EASE }} />}
                  <span className={`relative ${mode === k ? "text-cream-2" : "text-dusty-deep"}`}>{l}</span>
                </button>
              ))}
            </div>
            {mode === "side" ? (
              <div className="grid grid-cols-2 gap-3">
                {(["before", "after"] as const).map((ph) => (
                  <div key={ph}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={frameUrl(c.room!, ph, ph === "before" ? c.before_ts : c.after_ts)} alt={`${c.room} ${ph}`} className="aspect-[4/3] w-full rounded-[24px] object-cover shadow-[0_24px_50px_-28px_rgba(15,26,43,0.6)]" />
                    <p className="mt-2 text-sm text-dusty-deep">{ph === "before" ? "Before" : "After the flood"}</p>
                  </div>
                ))}
              </div>
            ) : (
              <PhotoSlider before={frameUrl(c.room!, "before", c.before_ts)} after={frameUrl(c.room!, "after", c.after_ts)} />
            )}
            {!!c.quality_warnings?.length && <p className="mt-3 text-sm text-dusty-deep">Video note: {c.quality_warnings[0]}</p>}
          </div>
        ) : (
          <div className="rounded-[28px] border border-dashed border-midnight/20 p-10 text-center">
            <p className="text-lg text-navy">These items came from an earlier scan.</p>
            <p className="mt-1 text-dusty-deep">Record this room again to see the before and after photos side by side.</p>
            <button onClick={() => go("scan")} className="pill-light mt-6">Scan a room</button>
          </div>
        )
      }
    />
  );
}

function PhotoSlider({ before, after }: { before: string; after: string }) {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const drag = (x: number) => {
    const r = ref.current!.getBoundingClientRect();
    setPos(Math.max(0, Math.min(100, ((x - r.left) / r.width) * 100)));
  };
  return (
    <div>
      <div
        ref={ref}
        className="relative aspect-[4/3] cursor-ew-resize touch-none select-none overflow-hidden rounded-[24px] shadow-[0_24px_50px_-28px_rgba(15,26,43,0.6)]"
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag(e.clientX); }}
        onPointerMove={(e) => e.buttons && drag(e.clientX)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={after} alt="After" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={before} alt="Before" className="h-full w-full object-cover" draggable={false} />
        </div>
        <div className="absolute inset-y-0 w-0.5 bg-cream-2" style={{ left: `${pos}%` }}>
          <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-cream-2 text-midnight shadow-lg">
            <ArrowLeftRight className="h-5 w-5" strokeWidth={1.75} />
          </span>
        </div>
        <span className="absolute left-4 top-4 rounded-full bg-navy/60 px-3 py-1 text-xs text-cream-2">Before</span>
        <span className="absolute right-4 top-4 rounded-full bg-navy/60 px-3 py-1 text-xs text-cream-2">After</span>
      </div>
      <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(+e.target.value)} className="sr-only" aria-label="Compare before and after" />
    </div>
  );
}
