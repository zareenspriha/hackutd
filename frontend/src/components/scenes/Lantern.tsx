"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ArrowLeft, Check, CloudLightning, HandHelping, Radar, Search, Send, ShieldCheck, Smartphone, UserRoundCheck, X, Zap } from "lucide-react";
import dynamic from "next/dynamic";
import Logo from "../Logo";
import { Thread } from "../Trust";
import { useDemo } from "../demo";
import { EASE } from "../ui";
import { syntheticHouseholds, tierOf } from "@/lib/mock";
import type { PriorityHousehold } from "@/lib/types";
import { useLive, type LCheckIn, type LOutreach } from "@/lib/live";

const RealMap = dynamic(() => import("../RealMap"), { ssr: false });

type Row = PriorityHousehold & { needs?: number; assigned_to?: string | null; contacted?: boolean; last_contact?: LOutreach | null; check_in?: LCheckIn | null; shares_hardship?: boolean };

type Tier = NonNullable<PriorityHousehold["tier"]>;
const tierColor: Record<Tier, string> = { urgent: "#b5574b", high: "#c99a4a", medium: "#bdc4d4", low: "#8a93a3" };
const tierLabel: Record<Tier, string> = { urgent: "Urgent", high: "High", medium: "Medium", low: "Low" };

/**
 * the lantern: the responder console. Families no one has heard from glow brightest.
 * Never shows balances: financial signals arrive as plain reasons and can only move a family up.
 * Live: polls GET /insurer/households every few seconds, so a family's score moves the moment they act in the app.
 */
export default function Lantern({ staff, onSignOut }: { staff?: string; onSignOut?: () => void }) {
  const { toast } = useDemo();
  const live = useLive();
  const livePri = live.staff?.priority;
  const cov = live.staff?.summary;
  const me = live.staffName ?? staff ?? "Responder";
  const [busy, setBusy] = useState<string | null>(null);
  const base = useMemo<Row[]>(
    () =>
      livePri
        ? livePri.map((h) => ({
            id: h.id, name: h.synthetic ? h.name : "Garcia household", lat: h.lat, lng: h.lng, zip: h.zip, score: h.score,
            severity: h.severity, fragility: h.fragility, silence: h.silence, reasons: h.reasons, isDemo: !h.synthetic, tier: tierOf(h.score),
            needs: h.needs, assigned_to: h.assigned_to, contacted: h.contacted, last_contact: h.last_contact, check_in: h.check_in, shares_hardship: h.shares_hardship,
          }))
        : syntheticHouseholds(),
    [livePri],
  );
  const [updated, setUpdated] = useState(false);
  const [tiers, setTiers] = useState<Tier[]>(["urgent", "high", "medium", "low"]);
  const [silentOnly, setSilentOnly] = useState(false);
  const [zip, setZip] = useState("");
  const [sel, setSel] = useState("garcia");
  const [panel, setPanel] = useState<"list" | "detail">("list");
  const [contacted, setContacted] = useState<Set<string>>(new Set());
  const wasContacted = (h: Row) => h.contacted || contacted.has(h.id);

  // Before the Garcias' after-scan arrives they sit mid-list; after, they jump to the top.
  const all = useMemo<Row[]>(() => {
    if (livePri) return [...base].sort((a, b) => b.score - a.score); // live scores already include the after-scan
    const g = updated
      ? { severity: 34, fragility: 28, silence: 28, score: 90, reasons: ["Large contents loss", "No claim started", "Under 1 week of savings"] }
      : { severity: 12, fragility: 28, silence: 18, score: 58, reasons: ["No claim started", "Under 1 week of savings"] };
    return base
      .map((h) => (h.isDemo ? { ...h, ...g, tier: tierOf(g.score) } : h))
      .sort((a, b) => b.score - a.score);
  }, [base, updated, livePri]);

  // Live: refresh every 4 seconds and say when the Garcias move.
  useEffect(() => {
    if (!livePri) return;
    const t = setInterval(() => live.refresh(), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!livePri]);
  const rank = all.findIndex((h) => h.id === "garcia") + 1;
  const prevRank = useRef(rank);
  const [synced, setSynced] = useState(() => new Date());
  useEffect(() => {
    if (!livePri) return;
    setSynced(new Date());
    const before = prevRank.current;
    prevRank.current = rank;
    if (before && rank && before !== rank) toast(`Garcia household moved ${rank < before ? "up" : "down"} to #${rank}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePri]);

  const [minLat, maxLat, minLng, maxLng] = [32.6, 33.0, -97.02, -96.48];
  const px = (lng: number) => ((lng - minLng) / (maxLng - minLng)) * 100;
  const py = (lat: number) => (1 - (lat - minLat) / (maxLat - minLat)) * 100;

  // ---- The storm: a front crosses the county, households light up as it hits them, the list ranks them live,
  // then one tap checks on every urgent household no one has reached, and Maria's phone gets the message.
  const [storm, setStorm] = useState<number | null>(null); // storm front, in map % (left to right)
  const [stormStage, setStormStage] = useState<"idle" | "hitting" | "reaching" | "done">("idle");
  const [stormReached, setStormReached] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const stormTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => void (stormTimer.current && clearInterval(stormTimer.current)), []);
  const hitBy = (h: Row) => storm === null || px(h.lng) <= storm;

  async function runStorm() {
    if (stormStage === "hitting" || stormStage === "reaching") return;
    setStormReached(null);
    setStormStage("hitting");
    setStorm(-12);
    if (livePri) await live.demo.storm(); // clear earlier outreach so the sweep starts from zero
    const t0 = Date.now(), DUR = 6500;
    const bolts = [0.18, 0.47, 0.71];
    stormTimer.current = setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / DUR);
      setStorm(-12 + k * 124);
      if (bolts.some((b) => Math.abs(k - b) < 0.012)) {
        setFlash(true);
        setTimeout(() => setFlash(false), 120);
      }
      if (k >= 1) {
        clearInterval(stormTimer.current!);
        setStorm(null);
        setStormStage("reaching");
        setTimeout(async () => {
          const r = livePri ? await live.sweep() : { reached: Math.round(all.filter((h) => h.tier === "urgent").length * 0.8) };
          setStormReached(r?.reached ?? 0);
          setSel("garcia");
          setPanel("detail");
          setStormStage("done");
        }, 1400);
      }
    }, 50);
  }

  const pool = storm === null ? all : all.filter(hitBy);
  const list = pool.filter((h) => tiers.includes(h.tier!) && (!silentOnly || !wasContacted(h)) && (!zip || h.zip?.startsWith(zip)));
  const shown = list.slice(0, 40);
  const inList = new Set(list.map((h) => h.id));
  const current = all.find((h) => h.id === sel) ?? all[0];
  const garciaLast = all.find((h) => h.id === "garcia")?.last_contact;
  // what Maria last received (never her own reply)
  const [toMaria, setToMaria] = useState<LOutreach | null>(null);
  useEffect(() => {
    if (garciaLast && garciaLast.kind !== "reply") setToMaria(garciaLast);
  }, [garciaLast]);
  // the selected family's conversation, live
  const [thread, setThread] = useState<LOutreach[]>([]);
  useEffect(() => {
    if (!livePri || !current) return;
    let on = true;
    const tick = () => live.staffThread(current.id).then((m) => on && setThread(m));
    setThread([]);
    tick();
    const t = setInterval(tick, 4000);
    return () => ((on = false), clearInterval(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, !!livePri, stormStage]);
  const hitUrgent = pool.filter((h) => h.tier === "urgent").length;
  const stats: [string, string | number, string?][] = storm !== null
    ? [
        ["Households hit", pool.length],
        ["Urgent", hitUrgent],
        ["Urgent reached", "0%"],
        ["Not reached yet", hitUrgent, hitUrgent ? "warn" : "ok"],
      ]
    : cov
    ? [
        ["Households affected", cov.households],
        ["Urgent", cov.urgent],
        ["Urgent reached", `${cov.coverage_pct}%`],
        ["Not reached yet", cov.overlooked, cov.overlooked ? "warn" : "ok"],
        ["Asked for help", cov.asked_for_help],
      ]
    : [
        ["Households affected", all.length],
        ["Claims started", all.filter((h) => h.silence <= 15).length],
        ["Silent", all.filter((h) => h.silence > 15).length],
        ["Urgent tier", all.filter((h) => h.tier === "urgent").length],
      ];

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    toast(r ? ok : "That didn't go through. Try again.");
  }
  const sweep = () =>
    run("sweep", async () => {
      const r = await live.sweep();
      if (r) toast(`Check-in sent to ${r.reached.toLocaleString()} households no one had reached`);
      return r;
    }, "Every urgent household has now been reached");


  return (
    <div className="flex h-full flex-col px-10 pb-8 pt-6 text-ivory">
      <div className="flex items-center justify-between">
        <span className="invert"><Logo width={96} animate={false} id="lantern-logo" /></span>
        <div className="flex items-center gap-3">
          {livePri ? (
            <span className="flex items-center gap-2 text-xs text-ivory/60" aria-live="polite">
              <motion.span className="h-1.5 w-1.5 rounded-full bg-sage" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.6, repeat: Infinity }} />
              Live · {synced.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
            </span>
          ) : (
            <button onClick={() => (setUpdated(true), setSel("garcia"), toast("New data: Garcia after-scan arrived"))} disabled={updated} className="flex h-9 items-center gap-2 rounded-full border border-ivory/20 px-3 text-xs text-cream-2 disabled:opacity-40">
              <Zap className="h-3.5 w-3.5" strokeWidth={1.75} /> {updated ? "Garcia data updated" : "Simulate new data"}
            </button>
          )}
          <span className="rounded-full bg-raised px-3 py-1.5 text-xs text-ivory">{staff ?? "Responder"}</span>
          <button onClick={onSignOut} className="flex h-9 items-center gap-2 rounded-full border border-ivory/20 px-4 text-sm text-cream-2 hover:bg-raised">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} /> Sign out
          </button>
        </div>
      </div>

      {/* headline, the numbers that matter, and the two big actions */}
      <div className="mt-8 flex items-end justify-between gap-8">
        <div>
          <h1 className="text-[52px] font-light leading-none tracking-[-0.03em] text-cream-2">
            No one overlooked<span className="text-dusty">.</span>
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            {stats.map(([l, v, tone]) => (
              <span key={l} className="flex items-baseline gap-2">
                <span className={`tnum text-[26px] font-light leading-none ${tone === "warn" ? "text-[#e3a196]" : "text-cream-2"}`}>{typeof v === "number" ? v.toLocaleString() : v}</span>
                <span className="text-sm text-ivory/60">{l.toLowerCase()}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={runStorm} disabled={stormStage === "hitting" || stormStage === "reaching"}
            className="flex h-12 items-center gap-2 rounded-full border border-ivory/25 px-5 text-sm font-medium text-cream-2 transition hover:bg-raised disabled:opacity-50">
            <CloudLightning className="h-4 w-4" strokeWidth={1.75} /> {stormStage === "idle" || stormStage === "done" ? "Replay the storm" : "Storm in progress…"}
          </button>
          {cov && cov.overlooked > 0 && (
            <button onClick={sweep} disabled={busy === "sweep"} className="flex h-12 items-center gap-2 rounded-full bg-cream-2 px-5 text-sm font-medium text-navy hover:bg-white disabled:opacity-50">
              <Radar className="h-4 w-4" strokeWidth={1.75} /> Check on everyone not reached
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 grid min-h-0 flex-1 grid-cols-[1fr_380px] gap-5 2xl:grid-cols-[1fr_440px]">
        {/* field */}
        <div className="relative min-h-0 overflow-hidden rounded-[28px] border border-ivory/10 bg-navy">
          <RealMap
            theme="dark"
            className="absolute inset-0"
            bounds={[[minLat, minLng], [maxLat, maxLng]]}
            stormLng={storm === null ? null : minLng + (storm / 100) * (maxLng - minLng)}
            selected={stormStage === "hitting" ? null : { lat: current.lat, lng: current.lng }}
            onPick={(id) => (setSel(id), setPanel("detail"))}
            points={all.map((h) => {
              const visible = inList.has(h.id);
              const x = px(h.lng);
              const waiting = storm !== null && x > storm; // storm hasn't reached them yet
              const crest = storm !== null && !waiting && storm - x < 6; // just hit: flare up
              const r0 = h.isDemo ? 4.5 : 1.6 + (h.score / 100) * 2.2;
              return {
                id: h.id, lat: h.lat, lng: h.lng,
                r: waiting ? 1.6 : crest ? r0 * 1.8 : r0,
                color: waiting ? "#8a93a3" : crest ? "#f2f1ee" : tierColor[h.tier!],
                opacity: waiting ? 0.45 : crest ? 0.95 : visible ? 0.45 + (h.score / 100) * 0.5 : 0.07,
                glow: crest || (h.tier === "urgent" && visible && storm === null),
              };
            })}
          />
          <AnimatePresence>
            {flash && <motion.div className="pointer-events-none absolute inset-0 z-[500] bg-cream-2" initial={{ opacity: 0.55 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} />}
          </AnimatePresence>
          {/* what's happening, in one line */}
          <AnimatePresence mode="wait">
            {stormStage !== "idle" && (
              <motion.div key={stormStage} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="absolute left-1/2 top-12 z-[600] flex w-max max-w-[92%] -translate-x-1/2 flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-[18px] text-center bg-midnight/90 px-4 py-2 text-sm text-cream-2 shadow-lg backdrop-blur">
                {stormStage === "hitting" && <><CloudLightning className="h-4 w-4 text-amber" strokeWidth={1.75} /> Storm crossing Dallas County · <b className="tnum font-medium">{pool.length.toLocaleString()}</b> households hit · <b className="tnum font-medium">{hitUrgent}</b> urgent</>}
                {stormStage === "reaching" && <><Radar className="h-4 w-4 animate-spin text-sage" strokeWidth={1.75} /> Checking on every urgent household no one has reached…</>}
                {stormStage === "done" && (
                  <>
                    <Check className="h-4 w-4 text-sage" /> {stormReached ? <>Check-in sent to <b className="tnum font-medium">{stormReached.toLocaleString()}</b> households in one tap</> : "Every urgent household was already reached"}
                    <button onClick={() => setStormStage("idle")} aria-label="Dismiss" className="ml-1 rounded-full p-0.5 hover:bg-raised"><X className="h-3.5 w-3.5" /></button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          {stormStage === "reaching" && (
            <motion.span className="pointer-events-none absolute left-1/2 top-1/2 z-[500] h-[140%] w-[140%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-sage/50"
              initial={{ scale: 0, opacity: 0.9 }} animate={{ scale: 1, opacity: 0 }} transition={{ duration: 1.4, ease: "easeOut" }} />
          )}
          {/* the family's side, live */}
          <AnimatePresence>
            {stormStage === "done" && (toMaria || !livePri) && (
              <motion.div initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ delay: 0.5, duration: 0.45, ease: EASE }}
                className="absolute bottom-3 left-3 z-[600] w-[min(260px,calc(100%-24px))] rounded-[22px] border border-ivory/15 bg-cream-2 p-4 text-navy shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]">
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-dusty-deep"><Smartphone className="h-3.5 w-3.5" strokeWidth={1.75} /> On Maria&apos;s phone · now</p>
                <p className="mt-2 text-[15px] leading-snug">{toMaria?.note ?? "Checking on you after the disaster. Are you safe? Reply in looma or call us anytime."}</p>
                <p className="mt-2 text-xs text-dusty-deep">From {toMaria?.by ?? me} · Real responders never ask for fees or your PIN.</p>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="pointer-events-none absolute left-3 top-3 z-[500] flex gap-3 rounded-full bg-midnight/80 px-3 py-1.5 text-xs text-ivory/80">
            {(Object.keys(tierLabel) as Tier[]).map((t) => (
              <span key={t} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: tierColor[t] }} /> {tierLabel[t]}</span>
            ))}
          </div>
        </div>

        {/* right panel: the ranked list, or one household */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-ivory/10 bg-midnight">
          {panel === "list" ? (
            <>
            <div className="border-b border-ivory/10 px-5 pb-4 pt-5">
              <div className="flex items-baseline justify-between">
                <p className="text-[20px] font-light text-cream-2">Who needs help first</p>
                <p className="tnum text-xs text-ivory/60">{list.length.toLocaleString()} households</p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {(Object.keys(tierLabel) as Tier[]).map((t) => {
                  const on = tiers.includes(t);
                  return (
                    <button key={t} aria-pressed={on} onClick={() => setTiers((x) => (on ? x.filter((y) => y !== t) : [...x, t]))}
                      className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs ${on ? "border-ivory/50 bg-raised text-cream-2" : "border-ivory/15 text-ivory/50"}`}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tierColor[t] }} /> {tierLabel[t]}
                    </button>
                  );
                })}
                <button aria-pressed={silentOnly} onClick={() => setSilentOnly(!silentOnly)}
                  className={`h-8 rounded-full border px-3 text-xs ${silentOnly ? "border-ivory/50 bg-raised text-cream-2" : "border-ivory/15 text-ivory/50"}`}>
                  Not reached
                </button>
                <label className="flex h-8 items-center gap-1.5 rounded-full border border-ivory/15 px-3 text-xs">
                  <Search className="h-3.5 w-3.5 text-ivory/60" strokeWidth={1.75} />
                  <input value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="ZIP" className="w-12 bg-transparent text-cream-2 outline-none placeholder:text-ivory/50" aria-label="Filter by ZIP" />
                </label>
              </div>
            </div>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          <LayoutGroup>
            <ol>
              {shown.map((h, i) => (
                <motion.li key={h.id} layout transition={{ duration: 0.5, ease: EASE }}>
                  <button
                    onClick={() => (setSel(h.id), setPanel("detail"))}
                    className={`flex w-full items-center gap-3 border-l-2 px-4 py-3 text-left ${h.id === sel ? "border-ivory bg-raised" : "border-transparent hover:bg-raised/60"}`}
                  >
                    <span className="tnum w-6 text-sm text-ivory/60">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[15px] text-cream-2">{h.name}</span>
                        <span className="tnum text-xs text-ivory/60">{h.zip}</span>
                      </span>
                      <span className="mt-1.5 flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-navy">
                          <span className="block h-full rounded-full" style={{ width: `${h.score}%`, background: tierColor[h.tier!] }} />
                        </span>
                        <span className="tnum w-7 text-right text-xs text-cream-2">{h.score}</span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-ivory/70">{h.reasons.slice(0, 2).join(" · ")}</span>
                    </span>
                    {h.check_in && (!h.check_in.safe || h.check_in.needs.length > 0) ? (
                      <HandHelping className="h-4 w-4 text-amber" strokeWidth={1.75} aria-label="Asked for help" />
                    ) : wasContacted(h) ? (
                      <Check className="h-4 w-4 text-sage" strokeWidth={1.75} aria-label="Reached" />
                    ) : null}
                  </button>
                </motion.li>
              ))}
            </ol>
          </LayoutGroup>
        </div>

            </>
          ) : (
        <AnimatePresence mode="wait">
          <motion.aside
            key={current.id + current.score}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-6"
          >
            <button onClick={() => setPanel("list")} className="mb-4 flex items-center gap-1.5 text-sm text-ivory/70 hover:text-cream-2">
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} /> All households
            </button>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-ivory/70">ZIP {current.zip}</p>
                <h2 className="mt-1 text-[28px] font-light text-cream-2">{current.name}</h2>
              </div>
              <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-navy" style={{ background: tierColor[current.tier!] }}>
                {tierLabel[current.tier!]} · {current.score}
              </span>
            </div>
            <div className="mt-5 space-y-3">
              {([
                ["Severity", current.severity, 40],
                ["Financial fragility", current.fragility, 30],
                ["Silence", current.silence, 30],
                ...(current.needs ? [["Asked for help", current.needs, 20]] : []),
              ] as [string, number, number][]).map(([l, v, m]) => (
                <div key={l as string}>
                  <div className="flex justify-between text-sm">
                    <span className="text-ivory/80">{l as string}</span>
                    <span className="tnum text-cream-2">{v as number} / {m as number}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-navy">
                    <motion.div className="h-full rounded-full bg-ivory" initial={{ width: 0 }} animate={{ width: `${((v as number) / (m as number)) * 100}%` }} transition={{ duration: 0.5, ease: EASE }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-5 text-xs uppercase tracking-[0.2em] text-ivory/70">Why they&apos;re here</p>
            <ul className="mt-2 space-y-1.5">
              {current.reasons.map((r) => (
                <li key={r} className="flex items-center gap-2 text-cream-2"><span className="h-1.5 w-1.5 rounded-full bg-ivory" /> {r}</li>
              ))}
            </ul>
            {current.check_in && (
              <div className={`mt-5 rounded-[12px] px-3 py-2.5 text-sm ${!current.check_in.safe || current.check_in.needs.length ? "bg-amber/20 text-cream-2" : "bg-navy text-ivory/80"}`}>
                <p className="font-medium">{current.check_in.safe ? "Family says they're safe" : "Family says they're not safe"}</p>
                {current.check_in.needs.length > 0 && <p className="mt-0.5">Needs: {current.check_in.needs.join(", ")}</p>}
              </div>
            )}
            {(current.assigned_to || current.last_contact) && (
              <div className="mt-3 space-y-1 text-sm text-ivory/80">
                {current.assigned_to && <p>Adjuster: <span className="text-cream-2">{current.assigned_to}</span></p>}
                {current.last_contact && (current.last_contact.kind === "reply"
                  ? <p className="text-cream-2">The family replied · see Messages below</p>
                  : <p>Last contact: {({ sweep: "automatic check-in", check_in: "check-in", assign: "assigned", bridge_offer: "Bridge Funds offer", message: "message" } as Record<string, string>)[current.last_contact.kind]} by {current.last_contact.by}</p>)}
              </div>
            )}
            <p className="mt-5 flex gap-2 rounded-[12px] bg-navy px-3 py-2.5 text-sm text-ivory/80">
              <ShieldCheck className="h-4 w-4 shrink-0 text-ivory" strokeWidth={1.75} />
              {current.shares_hardship === false
                ? "This family chose not to share hardship signals. You see loss and silence only."
                : "Financial details are shared as reasons only, never balances. Every action you take is shown to the family."}
            </p>
            <div className="mt-5 rounded-[14px] border border-ivory/10 p-3">
              <p className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-ivory/70">
                Messages <span className="normal-case tracking-normal text-ivory/50">The family sees these in looma</span>
              </p>
              <Thread side="staff" dark messages={livePri ? thread : []} placeholder={`Message the ${(current.name ?? "").replace(" household", "")} family…`}
                onSend={async (t) => {
                  if (!livePri) return (toast("Message sent"), true);
                  const ok = await live.message(current.id, t);
                  if (ok) setThread(await live.staffThread(current.id));
                  else toast("That didn't send. Try again.");
                  return ok;
                }} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {([["check_in", "Send a check-in"], ["bridge_offer", "Offer Bridge Funds"]] as const).map(([k, l]) => (
                  <button key={k} disabled={busy !== null}
                    onClick={() => (livePri ? run(k, async () => { const ok = await live.reachOut(current.id, k); setThread(await live.staffThread(current.id)); return ok; }, "Sent. The family sees it in looma.") : (setContacted((x) => new Set(x).add(current.id)), toast("Sent")))}
                    className="flex h-8 items-center gap-1.5 rounded-full border border-ivory/20 px-3 text-xs text-cream-2 hover:bg-raised disabled:opacity-50">
                    <Send className="h-3 w-3" strokeWidth={1.75} /> {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <button
                disabled={busy !== null || current.assigned_to === me}
                onClick={() => (livePri ? run("assign", () => live.assign(current.id, me), `You're now the adjuster for ${current.name}`) : toast(`Adjuster assigned to ${current.name}`))}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-ivory font-medium text-navy hover:bg-cream-2 disabled:opacity-50"
              >
                <UserRoundCheck className="h-4 w-4" strokeWidth={1.75} /> {current.assigned_to === me ? "Assigned to you" : current.assigned_to ? "Take over as adjuster" : "Assign to me"}
              </button>
            </div>
          </motion.aside>
        </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
