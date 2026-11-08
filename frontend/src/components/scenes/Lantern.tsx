"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ArrowLeft, Check, Search, Send, ShieldCheck, UserRoundCheck, Zap } from "lucide-react";
import Logo from "../Logo";
import { useDemo } from "../demo";
import { EASE } from "../ui";
import { syntheticHouseholds, tierOf } from "@/lib/mock";
import type { PriorityHousehold } from "@/lib/types";
import { useLive } from "@/lib/live";

type Tier = NonNullable<PriorityHousehold["tier"]>;
const tierColor: Record<Tier, string> = { urgent: "#b5574b", high: "#c99a4a", medium: "#bdc4d4", low: "#8a93a3" };
const tierLabel: Record<Tier, string> = { urgent: "Urgent", high: "High", medium: "Medium", low: "Low" };

/**
 * the lantern: the responder console. Families no one has heard from glow brightest.
 * Never shows balances: financial signals arrive as plain reasons and can only move a family up.
 * TODO (backend): GET /insurer/households?tier=&silent=&zip= and /insurer/households/{id}
 */
export default function Lantern({ staff, onSignOut }: { staff?: string; onSignOut?: () => void }) {
  const { toast } = useDemo();
  const live = useLive();
  const livePri = live.data?.priority;
  const base = useMemo<PriorityHousehold[]>(
    () =>
      livePri
        ? livePri.map((h) => ({
            id: h.id, name: h.synthetic ? h.name : "Garcia household", lat: h.lat, lng: h.lng, zip: h.zip, score: h.score,
            severity: h.severity, fragility: h.fragility, silence: h.silence, reasons: h.reasons, isDemo: !h.synthetic, tier: tierOf(h.score),
          }))
        : syntheticHouseholds(),
    [livePri],
  );
  const [updated, setUpdated] = useState(false);
  const [tiers, setTiers] = useState<Tier[]>(["urgent", "high", "medium", "low"]);
  const [silentOnly, setSilentOnly] = useState(false);
  const [zip, setZip] = useState("");
  const [sel, setSel] = useState("garcia");
  const [contacted, setContacted] = useState<Set<string>>(new Set());

  // Before the Garcias' after-scan arrives they sit mid-list; after, they jump to the top.
  const all = useMemo(() => {
    if (livePri) return [...base].sort((a, b) => b.score - a.score); // live scores already include the after-scan
    const g = updated
      ? { severity: 34, fragility: 28, silence: 28, score: 90, reasons: ["Large contents loss", "No claim started", "Under 1 week of savings"] }
      : { severity: 12, fragility: 28, silence: 18, score: 58, reasons: ["No claim started", "Under 1 week of savings"] };
    return base
      .map((h) => (h.isDemo ? { ...h, ...g, tier: tierOf(g.score) } : h))
      .sort((a, b) => b.score - a.score);
  }, [base, updated, livePri]);

  const list = all.filter((h) => tiers.includes(h.tier!) && (!silentOnly || h.silence > 15) && (!zip || h.zip?.startsWith(zip)));
  const shown = list.slice(0, 40);
  const inList = new Set(list.map((h) => h.id));
  const current = all.find((h) => h.id === sel) ?? all[0];
  const stats = {
    affected: all.length,
    started: all.filter((h) => h.silence <= 15).length,
    silent: all.filter((h) => h.silence > 15).length,
    urgent: all.filter((h) => h.tier === "urgent").length,
  };

  const [minLat, maxLat, minLng, maxLng] = [32.6, 33.0, -97.02, -96.48];
  const px = (lng: number) => ((lng - minLng) / (maxLng - minLng)) * 100;
  const py = (lat: number) => (1 - (lat - minLat) / (maxLat - minLat)) * 100;

  return (
    <div className="flex h-full flex-col px-8 pb-6 pt-5 text-ivory">
      <div className="mb-5 flex items-center justify-between">
        <span className="invert"><Logo width={96} animate={false} id="lantern-logo" /></span>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-raised px-3 py-1.5 text-xs text-ivory">Insurer staff · {staff ?? "Responder"}</span>
          <button onClick={onSignOut} className="flex h-10 items-center gap-2 rounded-full border border-ivory/20 px-4 text-sm text-cream-2 hover:bg-raised">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} /> Sign out
          </button>
        </div>
      </div>
      {/* top bar */}
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-ivory/70">The Lantern · Recovery priority · Dallas County flood · Nov 6</p>
          <h1 className="mt-2 text-[40px] font-light leading-none tracking-tight text-cream-2">
            No one overlooked<span className="text-dusty">.</span>
          </h1>
        </div>
        <div className="flex gap-3">
          {[
            ["Households affected", stats.affected],
            ["Claims started", stats.started],
            ["Silent", stats.silent],
            ["Urgent tier", stats.urgent],
          ].map(([l, v]) => (
            <div key={l as string} className="rounded-[16px] border border-ivory/10 bg-midnight px-5 py-3">
              <p className="tnum text-[28px] font-light leading-none text-cream-2">{(v as number).toLocaleString()}</p>
              <p className="mt-1 text-xs text-ivory/70">{l as string}</p>
            </div>
          ))}
        </div>
      </div>

      {/* filters */}
      <div className="mt-5 flex items-center gap-2">
        {(Object.keys(tierLabel) as Tier[]).map((t) => {
          const on = tiers.includes(t);
          return (
            <button
              key={t}
              aria-pressed={on}
              onClick={() => setTiers((x) => (on ? x.filter((y) => y !== t) : [...x, t]))}
              className={`flex h-10 items-center gap-2 rounded-full border px-4 text-sm ${on ? "border-ivory/60 bg-raised text-cream-2" : "border-ivory/15 text-ivory/60"}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: tierColor[t] }} /> {tierLabel[t]}
            </button>
          );
        })}
        <button aria-pressed={silentOnly} onClick={() => setSilentOnly(!silentOnly)} className={`h-10 rounded-full border px-4 text-sm ${silentOnly ? "border-ivory/60 bg-raised text-cream-2" : "border-ivory/15 text-ivory/60"}`}>
          Silent only
        </button>
        <label className="ml-2 flex h-10 items-center gap-2 rounded-full border border-ivory/15 px-4 text-sm">
          <Search className="h-4 w-4 text-ivory/60" strokeWidth={1.75} />
          <input value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="ZIP" className="w-16 bg-transparent text-cream-2 outline-none placeholder:text-ivory/50" aria-label="Filter by ZIP" />
        </label>
        <button onClick={() => (setUpdated(true), setSel("garcia"), livePri && live.refresh(), toast("New data: Garcia after-scan arrived"))} disabled={updated} className="ml-auto flex h-10 items-center gap-2 rounded-full bg-ivory px-4 text-sm font-medium text-navy disabled:opacity-40">
          <Zap className="h-4 w-4" strokeWidth={1.75} /> {updated ? "Garcia data updated" : "Simulate new data"}
        </button>
      </div>

      <div className="mt-4 grid min-h-0 flex-1 grid-cols-[360px_1fr_400px] gap-4">
        {/* ranked list */}
        <div className="no-scrollbar min-h-0 overflow-y-auto rounded-[16px] border border-ivory/10 bg-midnight">
          <p className="sticky top-0 z-10 bg-midnight px-4 py-3 text-xs text-ivory/70">{list.length.toLocaleString()} households · Showing top {shown.length}</p>
          <LayoutGroup>
            <ol>
              {shown.map((h, i) => (
                <motion.li key={h.id} layout transition={{ duration: 0.5, ease: EASE }}>
                  <button
                    onClick={() => setSel(h.id)}
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
                    {contacted.has(h.id) && <Check className="h-4 w-4 text-sage" strokeWidth={1.75} aria-label="Contacted" />}
                  </button>
                </motion.li>
              ))}
            </ol>
          </LayoutGroup>
        </div>

        {/* field */}
        <div className="relative min-h-0 overflow-hidden rounded-[16px] border border-ivory/10 bg-navy">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Map of affected households">
            <path d="M-5,62 C15,55 25,70 40,58 S65,40 78,52 S95,70 105,60" fill="none" stroke="#1c2e4a" strokeWidth={3} />
            {all.map((h) => {
              const visible = inList.has(h.id);
              return (
                <circle
                  key={h.id}
                  cx={px(h.lng)}
                  cy={py(h.lat)}
                  r={h.isDemo ? 0.9 : 0.35 + (h.score / 100) * 0.45}
                  fill={tierColor[h.tier!]}
                  opacity={visible ? 0.35 + (h.score / 100) * 0.6 : 0.06}
                  vectorEffect="non-scaling-stroke"
                  onClick={() => setSel(h.id)}
                  className="cursor-pointer"
                >
                  <title>{`${h.name} · score ${h.score} · ${tierLabel[h.tier!]}`}</title>
                </circle>
              );
            })}
          </svg>
          {/* pulse on the selected household */}
          <motion.span
            key={`${current.id}-${updated}`}
            className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ivory"
            style={{ left: `${px(current.lng)}%`, top: `${py(current.lat)}%` }}
            initial={{ scale: 0.6, opacity: 1 }}
            animate={{ scale: [0.6, 2.2], opacity: [1, 0] }}
            transition={{ duration: 1.2, repeat: current.isDemo ? 2 : 0, ease: "easeOut" }}
          />
          <span className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cream-2" style={{ left: `${px(current.lng)}%`, top: `${py(current.lat)}%` }} />
          <div className="absolute bottom-3 left-3 flex gap-3 rounded-full bg-midnight/80 px-3 py-1.5 text-xs text-ivory/80">
            {(Object.keys(tierLabel) as Tier[]).map((t) => (
              <span key={t} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: tierColor[t] }} /> {tierLabel[t]}</span>
            ))}
          </div>
          {/* TODO (Frontend): swap for react-leaflet + markercluster on CartoDB Dark Matter tiles */}
        </div>

        {/* detail drawer */}
        <AnimatePresence mode="wait">
          <motion.aside
            key={current.id + current.score}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="no-scrollbar min-h-0 overflow-y-auto rounded-[16px] border border-ivory/10 bg-midnight p-6"
          >
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
              {[
                ["Severity", current.severity, 40],
                ["Financial fragility", current.fragility, 30],
                ["Silence", current.silence, 30],
              ].map(([l, v, m]) => (
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
            <p className="mt-5 flex gap-2 rounded-[12px] bg-navy px-3 py-2.5 text-sm text-ivory/80">
              <ShieldCheck className="h-4 w-4 shrink-0 text-ivory" strokeWidth={1.75} /> Financial details are shared as reasons only. Scores can only move people up.
            </p>
            <div className="mt-5 space-y-2">
              <button onClick={() => toast(`Adjuster assigned to ${current.name}`)} className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-ivory font-medium text-navy hover:bg-cream-2">
                <UserRoundCheck className="h-4 w-4" strokeWidth={1.75} /> Assign adjuster
              </button>
              <button onClick={() => toast("Bridge Funds outreach sent")} className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-ivory/40 text-cream-2 hover:bg-raised">
                <Send className="h-4 w-4" strokeWidth={1.75} /> Send Bridge Funds outreach
              </button>
              <button onClick={() => (setContacted((s) => new Set(s).add(current.id)), toast("Marked contacted"))} className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] text-ivory/80 hover:bg-raised">
                <Check className="h-4 w-4" strokeWidth={1.75} /> {contacted.has(current.id) ? "Contacted" : "Mark contacted"}
              </button>
            </div>
          </motion.aside>
        </AnimatePresence>
      </div>
    </div>
  );
}
