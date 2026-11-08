"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useScroll, useTransform } from "motion/react";
import { ArrowRight, ChevronDown, LogOut, UserRound } from "lucide-react";
import Logo from "../Logo";
import RoomScene from "../RoomScene";
import { EASE, useNav } from "../ui";
import { firstName, initials, useAuth } from "@/lib/auth";
import type { AuthMode } from "../AuthModal";

/**
 * Public landing site. Nothing personal lives here: no balances, no amounts tied to a family.
 * 1) Full-screen title: the looma. wordmark.  2) Scroll: the story, revealed section by section.
 * Sign up / log in (or your profile) sits in the navbar; it is the only way into the app.
 */
type Menu = { key: string; label: string; items: { t: string; d: string }[]; Art: () => React.ReactElement };
const menus: Menu[] = [
  {
    key: "prove", label: "Prove it", Art: ArtScan,
    items: [
      { t: "Record your home", d: "Scan each room every six months. looma lists everything you own." },
      { t: "What changed", d: "Before and after, item by item, with proof attached." },
      { t: "Your claim", d: "Every dollar you're owed, documented." },
    ],
  },
  {
    key: "fund", label: "Fund it", Art: ArtFund,
    items: [
      { t: "Bridge funds", d: "Cash in minutes, repaid when the claim pays." },
      { t: "Bills", d: "Late fees paused. Every bill gets a plan." },
      { t: "Help circle", d: "Let family send help, tagged for recovery." },
    ],
  },
  {
    key: "navigate", label: "Navigate it", Art: ArtPath,
    items: [
      { t: "Ask looma", d: "\u201cCan I afford a hotel?\u201d Plain answers from your own numbers." },
      { t: "My money", d: "What you have, where to go, what to protect." },
      { t: "What if", d: "See the road ahead if the claim runs late." },
    ],
  },
];

const steps = [
  { key: "prove", n: "01", title: "Prove what you lost.", body: "Walk through each room once with your phone. After a disaster, scan again. looma finds what's missing or damaged and builds your claim with proof attached.", Art: ArtScan },
  { key: "fund", n: "02", title: "Get money now.", body: "Your proven claim unlocks Bridge funds in minutes, repaid automatically when insurance pays. Late fees pause, and every bill gets a plan.", Art: ArtFund },
  { key: "navigate", n: "03", title: "Plan what's next.", body: "Ask anything, like \u201ccan I afford a hotel?\u201d or \u201ccan we still take that trip?\u201d. You get a plain answer from your own numbers and one next step.", Art: ArtPath },
];

export default function Landing({ onAuth }: { onAuth: (m: AuthMode) => void }) {
  const { go } = useNav();
  const { user, logOut } = useAuth();
  const [open, setOpen] = useState<string | null>(null);
  const [profile, setProfile] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll({ container: scroller });
  const navLogo = useTransform(scrollY, [200, 420], [0, 1]);
  const heroFade = useTransform(scrollY, [0, 380], [1, 0]);
  const heroScale = useTransform(scrollY, [0, 380], [1, 0.92]);
  // Beige through the story, then the page deepens to dark blue for "how it works".
  const [howTop, setHowTop] = useState(1600);
  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>("#how");
    const measure = () => el && setHowTop(el.offsetTop);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
    const bgMix = useTransform(scrollY, [howTop - 900, howTop - 250], [0, 1]);
  const dark = useTransform(bgMix, (v) => v > 0.6);
  const [isDark, setIsDark] = useState(false);
  useEffect(() => dark.on("change", setIsDark), [dark]);

  const to = (id: string) => {
    setOpen(null);
    scroller.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    const close = () => setProfile(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  return (
    <div ref={scroller} className="no-scrollbar relative h-full overflow-y-auto scroll-smooth bg-butter">
      {/* dark blue layer that fades in as you scroll into "how it works" */}
      <motion.div style={{ opacity: bgMix }} className="pointer-events-none fixed inset-0 bg-[radial-gradient(70%_60%_at_20%_0%,#24395a,#0f1a2b_65%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,rgba(28,46,74,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(28,46,74,0.06)_1px,transparent_1px)] bg-[size:96px_96px] [mask-image:radial-gradient(70%_60%_at_50%_40%,#000,transparent)]" />

      {/* navbar */}
      <header className="sticky top-0 z-30" onMouseLeave={() => setOpen(null)}>
        <div className="mx-auto flex h-20 max-w-[1240px] items-center justify-between px-10">
          <motion.button style={{ opacity: navLogo }} className={isDark ? "invert" : ""} onClick={() => scroller.current?.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top">
            <Logo width={104} animate={false} id="nav-logo" />
          </motion.button>

          <nav className="relative flex items-center gap-1 rounded-full border border-midnight/10 bg-cream-2/75 p-1.5 backdrop-blur">
            {menus.map((m) => (
              <button
                key={m.key}
                onMouseEnter={() => setOpen(m.key)}
                onFocus={() => setOpen(m.key)}
                onClick={() => to(m.key)}
                aria-expanded={open === m.key}
                className={`flex h-10 items-center gap-1 rounded-full px-4 text-[15px] transition ${open === m.key ? "bg-midnight text-cream-2" : "text-dusty-deep hover:text-navy"}`}
              >
                {m.label} <ChevronDown className={`h-3.5 w-3.5 transition ${open === m.key ? "rotate-180" : ""}`} />
              </button>
            ))}
            <AnimatePresence>
              {open && (
                <motion.div
                  key={open}
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: EASE }}
                  className="absolute left-1/2 top-[56px] w-[620px] -translate-x-1/2 overflow-hidden rounded-[24px] border border-midnight/10 bg-cream-2 shadow-[0_30px_60px_-24px_rgba(15,26,43,0.35)]"
                >
                  {(() => {
                    const m = menus.find((x) => x.key === open)!;
                    return (
                      <div className="grid grid-cols-[1fr_210px]">
                        <ul className="p-3">
                          {m.items.map((it) => (
                            <li key={it.t}>
                              <button onClick={() => to(m.key)} className="w-full rounded-[16px] p-4 text-left transition hover:bg-cream">
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
          </nav>

          {/* right: profile when signed in, otherwise log in / sign up */}
          {user ? (
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setProfile(!profile)} aria-expanded={profile} className="flex h-11 items-center gap-2.5 rounded-full border border-midnight/10 bg-cream-2/75 py-1 pl-1 pr-4 backdrop-blur">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-midnight text-sm font-medium text-cream-2">{initials(user)}</span>
                <span className="text-[15px] text-navy">{firstName(user)}</span>
                <ChevronDown className="h-3.5 w-3.5 text-dusty-deep" />
              </button>
              <AnimatePresence>
                {profile && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="absolute right-0 top-14 w-56 overflow-hidden rounded-[18px] border border-midnight/10 bg-cream-2 p-1.5 shadow-[0_20px_40px_-20px_rgba(15,26,43,0.4)]">
                    <p className="px-3 pb-2 pt-2 text-xs text-dusty-deep">{user.email}</p>
                    <button onClick={() => go("today")} className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2.5 text-left text-navy hover:bg-cream">
                      <UserRound className="h-4 w-4" strokeWidth={1.75} /> My recovery plan
                    </button>
                    <button onClick={() => (logOut(), setProfile(false))} className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2.5 text-left text-navy hover:bg-cream">
                      <LogOut className="h-4 w-4" strokeWidth={1.75} /> Log out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => onAuth("login")} className={`h-11 rounded-full px-4 text-[15px] transition ${isDark ? "text-cream-2 hover:bg-ivory/10" : "text-navy hover:bg-cream-2/70"}`}>
                Log in
              </button>
              <button onClick={() => onAuth("signup")} className={`pill h-11 py-0 ${isDark ? "bg-cream-2 text-navy hover:bg-white" : "bg-midnight text-cream-2 hover:bg-navy"}`}>
                Sign up
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 1. title */}
      <motion.section style={{ opacity: heroFade, scale: heroScale }} className="relative -mt-20 flex h-dvh flex-col items-center justify-center">
        <Logo width={600} id="hero-logo" />
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.1, duration: 0.7, ease: EASE }} className="mt-8 text-[24px] font-light tracking-tight text-dusty-deep">
          Your calm after the storm.
        </motion.p>
        <motion.button
          onClick={() => to("story")}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, y: [0, 6, 0] }}
          transition={{ opacity: { delay: 2.8 }, y: { delay: 2.8, duration: 1.8, repeat: Infinity, ease: "easeInOut" } }}
          className="absolute bottom-10 flex flex-col items-center gap-1 text-xs tracking-[0.2em] text-dusty-deep"
          aria-label="Scroll down"
        >
          SCROLL <ChevronDown className="h-4 w-4" />
        </motion.button>
      </motion.section>

      {/* 2. what looma does (beige) */}
      <section id="story" className="relative mx-auto grid min-h-dvh max-w-[1240px] scroll-mt-20 grid-cols-12 items-center gap-10 px-10 py-20">
        <div className="col-span-6">
          <Reveal>
            <h1 className="text-[64px] font-normal leading-[0.98] tracking-[-0.035em] text-navy">
              Prove it. Fund it.
              <br />
              Navigate it.
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-dusty-deep">
              After a disaster, looma proves what you lost, puts money in your hands before the claim pays, and tells you the one thing to do next.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <button onClick={() => to("how")} className="pill-light mt-8">
              See how it works <ChevronDown className="h-4 w-4" />
            </button>
          </Reveal>
        </div>
        <div className="col-span-6 flex justify-center">
          <Phone />
        </div>
      </section>

      {/* 3. how it works: all three steps in one section, on the dark blue */}
      <section id="how" className="relative scroll-mt-20 text-cream-2">
        <div className="mx-auto max-w-[1240px] px-10 pb-24 pt-32">
          <Reveal>
            <p className="text-sm font-medium tracking-[0.2em] text-ivory/70">HOW IT WORKS</p>
            <h2 className="mt-4 max-w-3xl text-[56px] font-normal leading-[1] tracking-[-0.03em]">
              Three steps. <span className="text-ivory/60">One at a time.</span>
            </h2>
          </Reveal>
          <div className="mt-14 grid grid-cols-3 gap-6">
            {steps.map((st, i) => (
              <Reveal key={st.key} delay={0.1 + i * 0.12}>
                <div id={st.key} className="flex h-full scroll-mt-28 flex-col rounded-[28px] border border-ivory/10 bg-midnight/60 p-6 backdrop-blur">
                  <div className="flex h-[200px] items-center justify-center overflow-hidden rounded-[20px] bg-navy/60 px-4">
                    <StepVisual k={st.key} />
                  </div>
                  <p className="mt-6 text-sm font-medium tracking-[0.2em] text-ivory/60">{st.n}</p>
                  <h3 className="mt-2 text-[30px] font-normal leading-tight tracking-tight">{st.title}</h3>
                  <p className="mt-3 leading-relaxed text-ivory/80">{st.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        {/* facts (the same for everyone) */}
        <div className="border-t border-ivory/10">
          <div className="mx-auto grid max-w-[1240px] grid-cols-4 px-10">
            {[
              ["30 sec", "To scan a room"],
              ["Minutes", "To cash before the claim pays"],
              ["0", "Late fees while you recover"],
              ["1", "Next step at a time"],
            ].map(([n, l], i) => (
              <Reveal key={l} delay={i * 0.06} className="border-l border-ivory/10 px-6 py-12 last:border-r">
                <p className="tnum text-[40px] font-light leading-none">{n}</p>
                <p className="mt-2 text-ivory/70">{l}</p>
              </Reveal>
            ))}
          </div>
        </div>
        <footer className="mx-auto flex max-w-[1240px] items-center justify-between px-10 py-10 text-sm text-ivory/60">
          <span className="invert"><Logo width={72} animate={false} id="foot-logo" /></span>
          <span>Built at HackUTD 2026</span>
        </footer>
      </section>
    </div>
  );
}

/** Generic previews of each step. No names or amounts. */
function StepVisual({ k }: { k: string }) {
  if (k === "prove")
    return (
      <div className="grid w-full grid-cols-2 gap-2">
        {(["before", "after"] as const).map((ph) => (
          <div key={ph}>
            <div className="relative overflow-hidden rounded-[12px]">
              <RoomScene phase={ph} className="block aspect-[16/10] w-full" />
              {ph === "after" && (
                <>
                  <span className="absolute left-[6%] top-[70%] rounded bg-clay px-1 text-[8px] font-semibold text-cream-2">Damaged</span>
                  <span className="absolute left-[30%] top-[24%] rounded bg-slate px-1 text-[8px] font-semibold text-navy">Missing</span>
                </>
              )}
            </div>
            <p className="mt-1.5 text-xs text-ivory/70">{ph === "before" ? "Home record" : "After the disaster"}</p>
          </div>
        ))}
      </div>
    );
  if (k === "fund")
    return (
      <div className="relative h-[150px] w-[250px] overflow-hidden rounded-[18px] bg-[linear-gradient(135deg,#24395a,#0f1a2b_60%,#1c2e4a)] p-4 text-cream-2 ring-1 ring-ivory/15">
        <motion.div className="absolute -inset-x-10 top-0 h-full -skew-x-12 bg-gradient-to-r from-transparent via-ivory/15 to-transparent" animate={{ x: [-260, 320] }} transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.2 }} />
        <p className="text-sm font-medium">looma.</p>
        <p className="mt-6 text-[10px] uppercase tracking-[0.2em] text-ivory/70">Bridge funds</p>
        <p className="text-[22px] font-medium leading-tight">Cash today</p>
        <p className="mt-1 text-[11px] text-ivory/70">Repaid from your payout</p>
      </div>
    );
  return (
    <div className="w-full space-y-2 text-[13px]">
      <p className="ml-auto w-fit rounded-2xl rounded-br-md bg-cream-2 px-3 py-2 text-navy">Can we still take that trip?</p>
      <p className="w-fit max-w-[92%] rounded-2xl rounded-bl-md bg-raised px-3 py-2 text-cream-2">Not this month. It fits after the claim pays.</p>
      <p className="text-xs text-ivory/70"><span className="font-medium uppercase tracking-[0.14em]">Next</span> · Move the deposit date</p>
    </div>
  );
}

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ delay, duration: 0.7, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** A generic preview of the app: no names, no balances. Loops through the three steps. */
function Phone() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % 3), 2600);
    return () => clearInterval(t);
  }, []);
  const screens = [
    { label: "Scan a room", body: (
      <div className="mt-8 space-y-2">
        {["Laptop", "Floor lamp", "Area rug", "Backpack"].map((t, k) => (
          <motion.div key={t} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + k * 0.15 }} className="flex items-center justify-between rounded-[14px] bg-midnight px-4 py-3 text-sm">
            <span>{t}</span>
            <span className="text-ivory/70">{k === 2 ? "damaged" : "saved"}</span>
          </motion.div>
        ))}
      </div>
    ) },
    { label: "Bridge funds", body: (
      <div className="mt-10 flex flex-col items-center text-center">
        <p className="text-sm text-ivory/70">Your claim unlocks</p>
        <p className="mt-2 text-[40px] font-medium leading-none">Cash today</p>
        <p className="mt-3 text-sm text-ivory/70">Repaid when insurance pays</p>
        <div className="mt-8 h-14 w-full rounded-full bg-midnight p-1">
          <motion.span initial={{ x: 0 }} animate={{ x: 180 }} transition={{ delay: 0.4, duration: 0.8, ease: EASE }} className="flex h-12 w-12 items-center justify-center rounded-full bg-cream-2 text-navy"><ArrowRight className="h-5 w-5" /></motion.span>
        </div>
      </div>
    ) },
    { label: "Ask looma", body: (
      <div className="mt-8 space-y-3 text-sm">
        <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="ml-auto w-fit rounded-2xl rounded-br-md bg-cream-2 px-4 py-2.5 text-navy">Can we afford a hotel?</motion.p>
        <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-midnight px-4 py-2.5">Yes. Use Bridge funds first and leave your savings alone.</motion.p>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }} className="text-xs text-ivory/70">Next step: snap the hotel receipt.</motion.p>
      </div>
    ) },
  ];
  return (
    <Reveal>
      <div className="relative h-[600px] w-[300px] rounded-[48px] border-[10px] border-[#0b1422] bg-navy shadow-[0_50px_100px_-30px_rgba(15,26,43,0.65)]">
        <div className="absolute left-1/2 top-3 h-7 w-24 -translate-x-1/2 rounded-full bg-black/60" />
        <div className="flex h-full flex-col px-6 pb-8 pt-16 text-cream-2">
          <AnimatePresence mode="wait">
            <motion.div key={i} initial={{ opacity: 0, filter: "blur(6px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0, filter: "blur(6px)" }} transition={{ duration: 0.35 }}>
              <p className="text-center text-sm text-ivory/80">{screens[i].label}</p>
              {screens[i].body}
            </motion.div>
          </AnimatePresence>
          <div className="mt-auto flex justify-center gap-1.5">
            {screens.map((_, k) => <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? "w-6 bg-cream-2" : "w-1.5 bg-ivory/30"}`} />)}
          </div>
        </div>
      </div>
    </Reveal>
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
        Bridge funds
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
