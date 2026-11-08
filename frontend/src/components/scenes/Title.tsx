"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ChevronDown } from "lucide-react";
import Logo from "../Logo";
import { EASE, useNav, type SceneId } from "../ui";

/**
 * Landing site. Light, thin grid lines, oversized headline, a live phone mockup,
 * and nav dropdowns with small animated illustrations.
 */
const menus: { key: string; label: string; to: SceneId; items: { t: string; d: string; to: SceneId }[]; Art: () => React.ReactElement }[] = [
  {
    key: "prove", label: "Prove it", to: "scan", Art: ArtScan,
    items: [
      { t: "Scan a room", d: "Walk a room once. looma lists everything you own.", to: "scan" },
      { t: "What changed", d: "Before and after, item by item, with proof attached.", to: "compare" },
      { t: "Your claim", d: "Every dollar you're owed, documented.", to: "claim" },
    ],
  },
  {
    key: "fund", label: "Fund it", to: "fund", Art: ArtFund,
    items: [
      { t: "Bridge funds", d: "Cash in minutes, repaid when the claim pays.", to: "fund" },
      { t: "Bills", d: "Late fees paused. Every bill gets a plan.", to: "bills" },
      { t: "Help circle", d: "Let family send help, tagged for recovery.", to: "circle" },
    ],
  },
  {
    key: "navigate", label: "Navigate it", to: "ask", Art: ArtPath,
    items: [
      { t: "Ask looma", d: "“Can I afford a hotel?” Real answers, real numbers.", to: "ask" },
      { t: "My money", d: "What you have, where to go, what to protect.", to: "picture" },
      { t: "What if", d: "See the road ahead if the claim runs late.", to: "wait" },
    ],
  },
];

export default function Landing() {
  const { go } = useNav();
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Enter" && go("today");
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  return (
    <div className="no-scrollbar relative h-full overflow-y-auto bg-butter">
      {/* thin grid */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(28,46,74,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(28,46,74,0.07)_1px,transparent_1px)] bg-[size:96px_96px] [mask-image:radial-gradient(80%_70%_at_70%_30%,#000,transparent)]" />
      <div className="pointer-events-none absolute -right-40 -top-40 h-[620px] w-[620px] rounded-full bg-ivory/70 blur-[120px]" />

      <div className="relative mx-auto max-w-[1240px] px-10">
        {/* nav */}
        <header className="relative z-20 flex h-24 items-center justify-between" onMouseLeave={() => setOpen(null)}>
          <Logo width={112} animate={false} id="nav-logo" />
          <nav className="flex items-center gap-1 rounded-full border border-midnight/10 bg-cream-2/70 p-1.5 backdrop-blur">
            {menus.map((m) => (
              <button
                key={m.key}
                onMouseEnter={() => setOpen(m.key)}
                onFocus={() => setOpen(m.key)}
                onClick={() => setOpen(open === m.key ? null : m.key)}
                aria-expanded={open === m.key}
                className={`flex h-10 items-center gap-1 rounded-full px-4 text-[15px] transition ${open === m.key ? "bg-midnight text-cream-2" : "text-dusty-deep hover:text-navy"}`}
              >
                {m.label} <ChevronDown className={`h-3.5 w-3.5 transition ${open === m.key ? "rotate-180" : ""}`} />
              </button>
            ))}
            <button onClick={() => go("lantern")} onMouseEnter={() => setOpen(null)} className="h-10 rounded-full px-4 text-[15px] text-dusty-deep hover:text-navy">
              For responders
            </button>
          </nav>
          <button onClick={() => go("today")} className="pill-dark">
            Open looma <ArrowRight className="h-4 w-4" />
          </button>

          <AnimatePresence>
            {open && (
              <motion.div
                key={open}
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: EASE }}
                className="absolute left-1/2 top-[84px] w-[640px] -translate-x-1/2 overflow-hidden rounded-[24px] border border-midnight/10 bg-cream-2 shadow-[0_30px_60px_-24px_rgba(15,26,43,0.35)]"
              >
                {(() => {
                  const m = menus.find((x) => x.key === open)!;
                  return (
                    <div className="grid grid-cols-[1fr_220px]">
                      <ul className="p-3">
                        {m.items.map((it) => (
                          <li key={it.t}>
                            <button onClick={() => go(it.to)} className="w-full rounded-[16px] p-4 text-left transition hover:bg-cream">
                              <p className="font-medium text-navy">{it.t}</p>
                              <p className="mt-0.5 text-sm text-dusty-deep">{it.d}</p>
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="flex items-center justify-center border-l border-midnight/10 bg-cream">
                        <m.Art />
                      </div>
                    </div>
                  );
                })()}
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        {/* hero */}
        <section className="grid min-h-[calc(100dvh-96px)] grid-cols-12 items-center gap-10 pb-16">
          <div className="col-span-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
              <Logo width={330} id="hero-logo" />
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 2.0, duration: 0.6, ease: EASE }}
              className="mt-8 text-[64px] font-normal leading-[0.98] tracking-[-0.035em] text-navy"
            >
              Your calm after
              <br />
              the storm.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 2.2, duration: 0.6, ease: EASE }}
              className="mt-5 max-w-md text-lg leading-relaxed text-dusty-deep"
            >
              After a disaster, looma proves what you lost, puts money in your hands before the claim pays, and tells you the one thing to do next.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.4, duration: 0.6, ease: EASE }} className="mt-8 flex gap-3">
              <button onClick={() => go("today")} className="pill-dark">
                Open looma <ArrowRight className="h-4 w-4" />
              </button>
              <button onClick={() => go("scan")} className="pill-light">
                See how it works
              </button>
            </motion.div>
          </div>

          <div className="col-span-6 flex justify-center">
            <Phone />
          </div>
        </section>
      </div>

      {/* proof strip */}
      <section className="relative border-t border-midnight/10 bg-cream/60">
        <div className="mx-auto grid max-w-[1240px] grid-cols-4 px-10">
          {[
            ["30 sec", "To scan a room"],
            ["$2,480", "In hand in minutes"],
            ["0", "Late fees while you recover"],
            ["1", "Next step at a time"],
          ].map(([n, l], i) => (
            <motion.div
              key={l}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.5, ease: EASE }}
              className="border-l border-midnight/10 px-6 py-10 last:border-r"
            >
              <p className="tnum text-[40px] font-light leading-none text-navy">{n}</p>
              <p className="mt-2 text-dusty-deep">{l}</p>
            </motion.div>
          ))}
        </div>
      </section>
      <p className="py-8 text-center text-xs tracking-[0.2em] text-dusty-deep/70">PRESS ENTER TO OPEN LOOMA</p>
    </div>
  );
}

/** Dark phone mockup that plays a tiny looma moment on loop. */
function Phone() {
  const [n, setN] = useState(0);
  const amounts = ["$0", "$1", "$12", "$124", "$1,246"];
  useEffect(() => {
    const t = setInterval(() => setN((x) => (x + 1) % 9), 650);
    return () => clearInterval(t);
  }, []);
  const shown = amounts[Math.min(n, amounts.length - 1)];
  const done = n >= 6;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, rotate: -2 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ delay: 0.6, duration: 0.9, ease: EASE }}
      className="relative h-[620px] w-[310px] rounded-[48px] border-[10px] border-[#0b1422] bg-navy shadow-[0_50px_100px_-30px_rgba(15,26,43,0.65)]"
    >
      <div className="absolute left-1/2 top-3 h-7 w-24 -translate-x-1/2 rounded-full bg-black/60" />
      <div className="flex h-full flex-col px-6 pb-8 pt-16 text-cream-2">
        <p className="text-center text-sm text-ivory/80">Bridge funds</p>
        <div className="mt-14 flex h-20 items-center justify-center">
          <AnimatePresence mode="popLayout">
            <motion.p
              key={shown}
              initial={{ opacity: 0, filter: "blur(8px)", y: 10 }}
              animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
              exit={{ opacity: 0, filter: "blur(8px)", y: -10 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="tnum text-[56px] font-medium tracking-tight"
            >
              {shown}
            </motion.p>
          </AnimatePresence>
        </div>
        <p className="text-center text-sm text-ivory/70">Two weeks of hotel</p>
        <div className="mx-auto mt-8 rounded-full bg-midnight px-4 py-2 text-sm text-ivory">To checking ••4821 · $640</div>
        <div className="mt-auto">
          <AnimatePresence mode="wait">
            {done ? (
              <motion.div key="ok" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-[20px] bg-cream-2 p-4 text-navy">
                <p className="text-sm text-dusty-deep">It&apos;s in your checking</p>
                <p className="tnum text-2xl font-medium">$1,246</p>
                <p className="text-xs text-dusty-deep">Repaid when insurance pays</p>
              </motion.div>
            ) : (
              <motion.div key="swipe" exit={{ opacity: 0 }} className="relative h-14 rounded-full bg-midnight">
                <motion.span
                  className="absolute left-1 top-1 flex h-12 w-12 items-center justify-center rounded-full bg-cream-2 text-navy"
                  animate={{ x: n >= 5 ? 214 : 0 }}
                  transition={{ duration: 0.5, ease: EASE }}
                >
                  <ArrowRight className="h-5 w-5" />
                </motion.span>
                <span className="flex h-full items-center justify-center text-sm text-ivory/80">Swipe to unlock</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

/* ---- dropdown illustrations, each with a small live animation ---- */
function ArtScan() {
  return (
    <svg viewBox="0 0 160 120" className="h-36 w-48" aria-hidden>
      <rect x="20" y="16" width="120" height="88" rx="10" fill="none" stroke="#52677d" strokeWidth="1.5" />
      {[[34, 40, 30, 18], [80, 30, 40, 26], [46, 70, 54, 20]].map(([x, y, w, h], i) => (
        <motion.rect key={i} x={x} y={y} width={w} height={h} rx="3" fill="none" stroke="#1c2e4a" strokeWidth="1.5" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 1, 0] }} transition={{ duration: 2.4, delay: i * 0.4, repeat: Infinity }} />
      ))}
      <motion.line x1="20" x2="140" stroke="#1c2e4a" strokeWidth="2" initial={{ y1: 16, y2: 16 }} animate={{ y1: [16, 104, 16], y2: [16, 104, 16] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} />
    </svg>
  );
}
function ArtFund() {
  return (
    <svg viewBox="0 0 160 120" className="h-36 w-48" aria-hidden>
      <rect x="28" y="30" width="104" height="64" rx="10" fill="#1c2e4a" />
      <rect x="40" y="44" width="22" height="16" rx="3" fill="#bdc4d4" />
      <motion.text x="40" y="84" fontSize="14" fill="#f2f1ee" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.6, repeat: Infinity }}>
        $2,480
      </motion.text>
      <motion.circle cx="118" cy="46" r="6" fill="#c99a4a" animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 1.6, repeat: Infinity }} />
    </svg>
  );
}
function ArtPath() {
  return (
    <svg viewBox="0 0 160 120" className="h-36 w-48" aria-hidden>
      <line x1="16" x2="144" y1="90" y2="90" stroke="#bdc4d4" strokeDasharray="3 5" />
      <motion.path d="M16,40 L46,54 L70,48 L98,84 L122,30 L144,36" fill="none" stroke="#1c2e4a" strokeWidth="2" initial={{ pathLength: 0 }} animate={{ pathLength: [0, 1, 1] }} transition={{ duration: 2.6, repeat: Infinity, times: [0, 0.7, 1] }} />
      <motion.circle cx="98" cy="84" r="4" fill="#b5574b" animate={{ opacity: [0, 0, 1, 1] }} transition={{ duration: 2.6, repeat: Infinity, times: [0, 0.5, 0.55, 1] }} />
    </svg>
  );
}
