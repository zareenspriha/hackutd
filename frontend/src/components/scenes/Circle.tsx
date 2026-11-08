"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { CheckCircle2, CircleDashed, Plus, Send, Share2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useDemo } from "../demo";
import { EASE, Rise, Stage, useNav } from "../ui";
import { atms, circle } from "@/lib/demoData";
import { forecast } from "@/lib/mock";
import { usd } from "@/lib/format";
import { useLive, type LForecast, type LiveData } from "@/lib/live";

const RealMap = dynamic(() => import("../RealMap"), { ssr: false });

type Atm = { lat?: number; lng?: number; name: string; dist: string; open: boolean; x: number; y: number; closest?: boolean; minutes?: number; hours?: string };

/** Live ATMs placed around the family's location (the pulsing dot sits at 48%, 52%). */
function liveAtms(d: LiveData): Atm[] {
  const all = [...d.cash.working.slice(0, 4), ...d.cash.out_of_service.slice(0, 2)];
  const span = Math.max(0.01, ...all.map((a) => Math.max(Math.abs(a.lat - d.home.lat), Math.abs(a.lng - d.home.lng)))) * 2.4;
  return all
    .sort((a, b) => a.distance_km - b.distance_km)
    .map((a) => ({
      name: a.name,
      dist: `${(a.distance_km / 1.609).toFixed(1)} mi`,
      open: a.working,
      lat: a.lat,
      lng: a.lng,
      closest: !!a.closest,
      minutes: a.minutes_driving,
      hours: a.hours,
      x: Math.min(94, Math.max(6, 48 + ((a.lng - d.home.lng) / span) * 100)),
      y: Math.min(90, Math.max(10, 52 - ((a.lat - d.home.lat) / span) * 100)),
    }));
}

/** Map view that fits home and every ATM shown, with a little room for the pin tooltips. */
function atmBounds(d: LiveData): [[number, number], [number, number]] {
  const pts = [[d.home.lat, d.home.lng], ...[...d.cash.working.slice(0, 4), ...d.cash.out_of_service.slice(0, 2)].map((a) => [a.lat, a.lng])];
  const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1]);
  const pad = 0.006;
  return [[Math.min(...lats) - pad, Math.min(...lngs) - pad], [Math.max(...lats) + pad * 2.5, Math.max(...lngs) + pad]];
}

export default function Circle() {
  const { go } = useNav();
  const { s, set, toast } = useDemo();
  const live = useLive();
  const d = live.data;
  const [fc, setFc] = useState<LForecast | null>(null);
  useEffect(() => {
    if (!d) return;
    live.forecast({ claimDelayDays: 42 }).then(setFc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, s.paycheckDelayed]);

  // Gap comes from the forecast (6-week claim, today's state).
  const pts = fc
    ? fc.days.filter((p) => p.day <= fc.payout_day)
    : forecast(6, 1, s.paycheckDelayed ? 2 : 0, s.bridgeTaken ? 2480 : 0).map((p) => ({ ...p, balance: p.balance + (s.sisterSent ? 200 : 0) }));
  const low = pts.reduce((m, p) => (p.balance < m.balance ? p : m), pts[0]);
  const atmList: Atm[] = d ? liveAtms(d) : atms.map((a, i) => ({ ...a, closest: i === 0 }));
  const [hover, setHover] = useState<string | null>(null);
  const ci = d?.home.check_in;
  const youAre = d ? (ci?.lat != null ? "You · Current location (shared)" : "You · Home address on file") : "You · Hotel on Preston Rd";
  // Live: the circle and what each person sent come from the backend. Mock: the demo list.
  const members = d?.home.circle
    ? d.home.circle
    : circle.map((p) => ({ name: p.name, relation: p.rel[0]!.toUpperCase() + p.rel.slice(1), invited: false,
        sent: p.rel === "sister" ? (s.sisterSent ? 200 : 0) : p.sent }));
  const lastGift = d?.home.help_circle.at(-1);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRel, setNewRel] = useState("Family");
  const ini = (n: string) => n.split(" ").filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join("");

  async function askOne(name: string) {
    if (!d) return toast(`Asked ${name.split(" ")[0]}`);
    const ok = await live.requestHelp([name], gap || undefined);
    toast(ok ? `Asked ${name.split(" ")[0]}. They'll get a link to send help.` : "That didn't send. Try again.");
  }

  async function share(amount: number) {
    const link = d ? await live.requestHelp([], amount) : null;
    try {
      if (link) await navigator.clipboard?.writeText(`I could use help covering ${usd(amount)} until our claim pays: ${link}`);
    } catch {
      /* clipboard blocked: the toast still confirms */
    }
    toast(link ? "Request link copied. Everyone you hadn't asked yet has been asked." : "Link copied. Share it with your circle.");
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const n = newName.trim();
    if (!n) return;
    if (d && !(await live.addToCircle(n, newRel))) return toast(`${n} is already in your circle`);
    toast(`${n} added to your circle`);
    setNewName("");
    setAdding(false);
  }
  const gap = Math.max(0, Math.ceil(-low.balance / 50) * 50);
  const when = new Date(new Date("2026-11-08T12:00:00").getTime() + low.day * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <Stage
      left={
        <>
          <Rise>
            <p className="eyebrow">Help circle</p>
            <h1 className="headline mt-4 text-[60px]">
              Let your people <span className="text-dusty">help.</span>
            </h1>
          </Rise>

          <Rise delay={0.1} className="mt-7 rounded-[20px] bg-midnight p-6 text-cream-2">
            {gap > 0 ? (
              <>
                <p className="text-xs uppercase tracking-[0.2em] text-ivory">Ask for help</p>
                <p className="mt-2 text-[26px] font-light leading-snug">You may be {usd(gap)} short around {when} if the claim runs late.</p>
                {members.some((m) => !m.invited && !m.sent) ? (
                  <button onClick={() => share(gap)} className="pill mt-4 bg-cream-2 text-midnight hover:bg-white">
                    <Share2 className="h-4 w-4" strokeWidth={1.75} /> Ask everyone for {usd(gap)}
                  </button>
                ) : (
                  <p className="mt-3 text-sm text-ivory">Everyone in your circle has been asked.</p>
                )}
                <p className="mt-2 text-xs text-ivory/70">Nothing is sent until you tap. You can also ask one person below.</p>
              </>
            ) : (
              <>
                <p className="text-xs uppercase tracking-[0.2em] text-ivory">You&apos;re covered</p>
                <p className="mt-2 text-[26px] font-light leading-snug">No gap right now, even if the claim runs six weeks.</p>
              </>
            )}
          </Rise>

          <Rise delay={0.18} className="mt-4 rounded-[20px] border border-navy/[0.08] bg-cream p-5">
            <p className="eyebrow">Your circle</p>
            <ul className="mt-3 space-y-3">
              {members.map((p) => (
                <li key={p.name} className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ivory text-sm font-semibold text-midnight">{ini(p.name)}</span>
                  <div className="flex-1">
                    <p className="text-navy">{p.name}</p>
                    <p className="text-sm text-dusty-deep">{p.relation}</p>
                  </div>
                  {p.sent ? (
                    <span className="tnum flex items-center gap-1.5 text-sm text-navy"><CheckCircle2 className="h-4 w-4 text-sage" strokeWidth={1.75} /> Sent {usd(p.sent)}</span>
                  ) : p.invited ? (
                    <span className="flex items-center gap-1.5 text-sm text-dusty-deep">
                      <Send className="h-3.5 w-3.5" strokeWidth={1.75} /> Asked
                      {"asked_at" in p && typeof p.asked_at === "string" ? ` ${new Date(p.asked_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}
                    </span>
                  ) : (
                    <button onClick={() => askOne(p.name)} className="pill h-9 border border-midnight/20 px-4 text-sm text-midnight hover:bg-cream-2">
                      <Send className="h-3.5 w-3.5" strokeWidth={1.75} /> Ask
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {adding ? (
              <form onSubmit={add} className="mt-4 flex gap-2">
                <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" aria-label="Name"
                  className="h-11 min-w-0 flex-1 rounded-[12px] border border-navy/[0.12] bg-white/60 px-3 text-navy outline-none focus:border-midnight" />
                <select value={newRel} onChange={(e) => setNewRel(e.target.value)} aria-label="Relationship"
                  className="h-11 rounded-[12px] border border-navy/[0.12] bg-white/60 px-2 text-navy outline-none">
                  {["Family", "Friend", "Neighbor", "Coworker"].map((r) => <option key={r}>{r}</option>)}
                </select>
                <button className="pill-dark h-11 px-4" disabled={!newName.trim()}>Add</button>
              </form>
            ) : (
              <button onClick={() => setAdding(true)} className="mt-4 flex items-center gap-1.5 text-sm font-medium text-midnight underline underline-offset-4">
                <Plus className="h-4 w-4" strokeWidth={1.75} /> Add someone
              </button>
            )}
            {(lastGift || (!d && s.sisterSent)) && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 rounded-[14px] bg-cream-2 px-4 py-2.5 text-sm text-dusty-deep">
                {usd(lastGift?.amount ?? 200)} from {(lastGift?.from_name ?? "Ana").split(" ")[0]} · tagged as recovery help
              </motion.p>
            )}
          </Rise>
        </>
      }
      right={
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5, ease: EASE }}>
          <p className="eyebrow mb-3">Cash access · Working ATMs near you</p>
          <div className="relative aspect-[16/9] overflow-hidden rounded-[28px] bg-cream-2 shadow-[0_24px_50px_-28px_rgba(15,26,43,0.5)]">
            {d ? (
              <RealMap theme="light" className="absolute inset-0" bounds={atmBounds(d)}
                overlay={(project) => (
                  <>
                {atmList.map((a) => {
                  const pt = project(a.lat!, a.lng!);
                  const on = hover === a.name;
                  return (
                    <div key={a.name} className={`absolute -translate-x-1/2 -translate-y-full ${on ? "z-20" : a.closest ? "z-10" : ""}`} style={{ left: pt.x, top: pt.y }}
                      onMouseEnter={() => setHover(a.name)} onMouseLeave={() => setHover(null)}>
                      <button aria-label={`${a.name}, ${a.dist}${a.open ? "" : ", offline"}`} onFocus={() => setHover(a.name)} onBlur={() => setHover(null)}
                        className={`block transition ${on ? "scale-125" : ""}`}>
                        <svg width="22" height="28" viewBox="0 0 22 28" aria-hidden>
                          <path d="M11 27s9-9.2 9-15.5A9 9 0 1 0 2 11.5C2 17.8 11 27 11 27z" fill={a.open ? "#1c2e4a" : "#8a93a3"} />
                          <circle cx="11" cy="11" r="3.2" fill="#f2f1ee" />
                        </svg>
                      </button>
                      {a.closest && !on && (
                        <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-midnight px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cream-2">Closest</span>
                      )}
                      {on && (
                        <div className={`pointer-events-none absolute left-1/2 ${pt.y < 110 ? "top-full mt-1" : "bottom-full mb-2"} w-max max-w-[220px] -translate-x-1/2 rounded-[12px] bg-midnight px-3 py-2 text-xs text-cream-2 shadow-lg`}>
                          <p className="flex items-center gap-1.5 text-[13px] font-medium">{a.name}{a.closest && <span className="rounded-full bg-cream-2/20 px-1.5 py-px text-[10px] uppercase tracking-wider">Closest</span>}</p>
                          <p className="mt-0.5 text-ivory">{a.dist} from you{a.minutes ? ` · about ${a.minutes} min drive` : ""}</p>
                          <p className="text-ivory">{a.open ? (a.hours ? `Working · ${a.hours}` : "Working") : "Offline after the disaster"}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="absolute" style={(() => { const p = project(d!.home.lat, d!.home.lng); return { left: p.x, top: p.y }; })()}>
                  <motion.span className="absolute -left-4 -top-4 h-8 w-8 rounded-full bg-dusty/30" animate={{ scale: [1, 1.8], opacity: [0.6, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }} />
                  <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full border-2 border-cream-2 bg-dusty" />
                </div>
                  </>
                )}
              />
            ) : (
              <>
            {/* offline demo: stylized street map */}
            <svg viewBox="0 0 100 56" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
              <rect width="100" height="56" fill="#e6e4df" />
              {[10, 24, 40, 55, 70, 86].map((x) => <line key={x} x1={x} x2={x + 4} y1={0} y2={56} stroke="#f2f1ee" strokeWidth={1.4} />)}
              {[9, 21, 34, 47].map((y) => <line key={y} x1={0} x2={100} y1={y} y2={y + 2} stroke="#f2f1ee" strokeWidth={1.4} />)}
              <path d="M0,40 C20,36 30,46 50,40 S80,30 100,34" stroke="#bdc4d4" strokeWidth={3} fill="none" />
              <rect x="62" y="4" width="14" height="10" rx="1" fill="#6e9277" opacity="0.25" />
            </svg>
            {atmList.map((a) => {
              const on = hover === a.name;
              return (
                <div key={a.name} className={`absolute -translate-x-1/2 -translate-y-full ${on ? "z-20" : a.closest ? "z-10" : ""}`} style={{ left: `${a.x}%`, top: `${a.y}%` }}
                  onMouseEnter={() => setHover(a.name)} onMouseLeave={() => setHover(null)}>
                  <button aria-label={`${a.name}, ${a.dist}${a.open ? "" : ", offline"}`} onFocus={() => setHover(a.name)} onBlur={() => setHover(null)}
                    className={`block transition ${on ? "scale-125" : ""}`}>
                    <svg width="22" height="28" viewBox="0 0 22 28" aria-hidden>
                      <path d="M11 27s9-9.2 9-15.5A9 9 0 1 0 2 11.5C2 17.8 11 27 11 27z" fill={a.open ? "#1c2e4a" : "#8a93a3"} />
                      <circle cx="11" cy="11" r="3.2" fill="#f2f1ee" />
                    </svg>
                  </button>
                  {a.closest && !on && (
                    <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-midnight px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cream-2">Closest</span>
                  )}
                  {on && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 w-max max-w-[220px] -translate-x-1/2 rounded-[12px] bg-midnight px-3 py-2 text-xs text-cream-2 shadow-lg">
                      <p className="flex items-center gap-1.5 text-[13px] font-medium">{a.name}{a.closest && <span className="rounded-full bg-cream-2/20 px-1.5 py-px text-[10px] uppercase tracking-wider">Closest</span>}</p>
                      <p className="mt-0.5 text-ivory">{a.dist} from you{a.minutes ? ` · about ${a.minutes} min drive` : ""}</p>
                      <p className="text-ivory">{a.open ? (a.hours ? `Working · ${a.hours}` : "Working") : "Offline after the disaster"}</p>
                    </div>
                  )}
                </div>
              );
            })}
            <div className="absolute" style={{ left: "48%", top: "52%" }}>
              <motion.span className="absolute -left-4 -top-4 h-8 w-8 rounded-full bg-dusty/30" animate={{ scale: [1, 1.8], opacity: [0.6, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }} />
              <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full border-2 border-cream-2 bg-dusty" />
            </div>
              </>
            )}
            <span className="pointer-events-none absolute bottom-4 left-4 z-[500] rounded-full bg-midnight/80 px-3 py-1 text-xs text-cream-2">{youAre}</span>
          </div>
          <ul className="mt-4 space-y-2">
            {atmList.map((a) => (
              <li key={a.name} onMouseEnter={() => setHover(a.name)} onMouseLeave={() => setHover(null)}
                className={`flex items-center gap-4 rounded-[16px] border px-5 py-3 transition ${hover === a.name ? "border-midnight/30 bg-cream-2" : "border-navy/[0.08] bg-cream"}`}>
                <span className="tnum w-14 text-sm text-dusty-deep">{a.dist}</span>
                <span className="flex-1 text-navy">{a.name}{a.closest && <span className="ml-2 rounded-full bg-midnight px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cream-2">Closest</span>}</span>
                {a.open ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-sage/20 px-2.5 py-1 text-xs font-medium text-[#3f6248]"><CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} /> Open</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate/25 px-2.5 py-1 text-xs font-medium text-dusty-deep"><CircleDashed className="h-3.5 w-3.5" strokeWidth={1.75} /> Offline</span>
                )}
              </li>
            ))}
          </ul>
        </motion.div>
      }
    />
  );
}
