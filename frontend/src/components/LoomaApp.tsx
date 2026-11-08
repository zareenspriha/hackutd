"use client";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  ArrowLeft, ArrowRight, Check, ArrowLeftRight, CalendarClock, FileCheck2, HandCoins, HandHeart, Home, MessageCircle, Radar, ScanLine, Sparkles, Wallet,
} from "lucide-react";
import Logo from "./Logo";
import Cat from "./Cat";
import { NavCtx, SCENES, type SceneId } from "./ui";
import { PILLARS, pillarOf } from "./pillars";
import { DemoProvider, useDemo } from "./demo";
import Landing from "./scenes/Title";
import Today from "./scenes/Today";
import Scan from "./scenes/Scan";
import Compare from "./scenes/Compare";
import Claim from "./scenes/Claim";
import Fund from "./scenes/Fund";
import Bills from "./scenes/Bills";
import Circle from "./scenes/Circle";
import Ask from "./scenes/Ask";
import Picture from "./scenes/Picture";
import Wait from "./scenes/Wait";
import Lantern from "./scenes/Lantern";

const view: Record<SceneId, React.ComponentType> = {
  title: Landing, today: Today, scan: Scan, compare: Compare, claim: Claim, fund: Fund, bills: Bills,
  circle: Circle, ask: Ask, picture: Picture, wait: Wait, lantern: Lantern,
};


export default function LoomaApp() {
  return (
    <MotionConfig reducedMotion="user">
      <DemoProvider>
        <Shell />
      </DemoProvider>
    </MotionConfig>
  );
}

function Shell() {
  const { s: demo } = useDemo();
  const [scene, setScene] = useState<SceneId>("title");
  const [dir, setDir] = useState(1);

  const go = useCallback(
    (s: SceneId) => {
      setDir(SCENES.indexOf(s) >= SCENES.indexOf(scene) ? 1 : -1);
      setScene(s);
      history.replaceState(null, "", s === "title" ? "/" : `#${s}`);
    },
    [scene],
  );
  const next = useCallback(() => go(SCENES[Math.min(SCENES.indexOf(scene) + 1, SCENES.length - 1)]), [go, scene]);
  const back = useCallback(() => go(SCENES[Math.max(SCENES.indexOf(scene) - 1, 0)]), [go, scene]);

  useEffect(() => {
    const h = window.location.hash.slice(1) as SceneId;
    if (SCENES.includes(h)) setScene(h);
  }, []);

  // Presenter keys: ← → walk the app in order.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, back]);

  const View = view[scene];
  const surface = scene === "title" ? "landing" : scene === "lantern" ? "lantern" : "app";

  return (
    <NavCtx.Provider value={{ scene, go, next, back }}>
      <div className="relative h-dvh w-full overflow-hidden bg-navy" onScroll={(e) => (e.currentTarget.scrollTop = 0)}>
        <AnimatePresence mode="wait" initial={false}>
          {surface === "landing" && (
            <motion.div key="landing" className="absolute inset-0" exit={{ opacity: 0, scale: 0.98, filter: "blur(6px)" }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
              <Landing />
            </motion.div>
          )}

          {surface === "lantern" && (
            <motion.div key="lantern" className="dark absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }}>
              <Lantern />
            </motion.div>
          )}

          {surface === "app" && (
            <motion.div
              key="app"
              className="absolute inset-0 flex gap-3 bg-[radial-gradient(60%_50%_at_0%_0%,#24395a_0%,transparent_60%),radial-gradient(50%_60%_at_100%_100%,#1c2e4a_0%,transparent_60%)] p-3"
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* sidebar */}
              <motion.aside
                initial={{ x: -24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="dark flex w-[256px] shrink-0 flex-col rounded-[24px] border border-ivory/10 bg-midnight/50 p-4 text-ivory backdrop-blur-xl"
              >
                <button onClick={() => go("title")} className="invert px-2 pt-1 text-left" aria-label="looma home">
                  <Logo width={104} animate={false} id="side-logo" />
                </button>
                <div className="mt-4 flex items-center gap-3 rounded-[16px] bg-navy/50 px-3 py-2.5">
                  <Cat size={22} light blink={false} />
                  <div className="leading-tight">
                    <p className="text-sm text-cream-2">Garcia household</p>
                    <p className="text-xs text-ivory/70">Day 2 · Claim {demo.claimFiled ? "filed" : "pending"}</p>
                  </div>
                </div>

                <nav className="no-scrollbar mt-4 flex-1 overflow-y-auto">
                  <SideButton active={scene === "today"} onClick={() => go("today")} icon={Home} label="Home" />
                  {PILLARS.map((p) => {
                    const here = pillarOf(scene)?.key === p.key;
                    const done = p.key === "prove" ? demo.claimFiled : p.key === "fund" ? demo.bridgeTaken : false;
                    return (
                      <div key={p.key} className="mt-3">
                        <button
                          onClick={() => go(p.items[0].id)}
                          className={`flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-left transition ${here ? "text-cream-2" : "text-ivory/80 hover:text-cream-2"}`}
                        >
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs ${done ? "border-sage bg-sage text-navy" : here ? "border-cream-2 bg-cream-2 text-navy" : "border-ivory/40"}`}>
                            {done ? <Check className="h-4 w-4" strokeWidth={2.2} /> : p.n}
                          </span>
                          <span className="text-[15px] font-medium">{p.title}</span>
                        </button>
                        <AnimatePresence initial={false}>
                          {here && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="ml-[26px] overflow-hidden border-l border-ivory/15 pl-3">
                              {p.items.map((it) => (
                                <SideButton key={it.id} small active={scene === it.id} onClick={() => go(it.id)} icon={it.icon} label={it.label} />
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </nav>

                {demo.disasterMode && (
                  <button onClick={() => go("bills")} className="mb-2 flex items-center gap-2 rounded-[12px] bg-navy/60 px-3 py-2.5 text-left text-xs text-ivory">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber" /> Disaster Mode is on. Late fees are paused.
                  </button>
                )}
                <button onClick={() => go("lantern")} className="flex h-10 items-center gap-3 rounded-[12px] px-3 text-[14px] text-ivory/75 hover:bg-ivory/5 hover:text-cream-2">
                  <Radar className="h-[18px] w-[18px]" strokeWidth={1.75} /> Responder view
                </button>
                <p className="px-3 pt-2 text-[11px] text-ivory/40">← → to move · Shift+D for demo</p>
              </motion.aside>

              {/* content pane */}
              <main className="pane relative min-w-0 flex-1 overflow-hidden rounded-[24px] bg-butter">
                <div className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-white/40 blur-[110px]" />
                <div className="pointer-events-none absolute -bottom-48 -right-32 h-[480px] w-[480px] rounded-full bg-ivory/60 blur-[110px]" />
                <AnimatePresence mode="popLayout" custom={dir} initial={false}>
                  <motion.section
                    key={scene}
                    custom={dir}
                    variants={{
                      enter: (d: number) => ({ opacity: 0, y: d * 24, filter: "blur(6px)" }),
                      center: { opacity: 1, y: 0, filter: "blur(0px)" },
                      exit: (d: number) => ({ opacity: 0, y: d * -24, filter: "blur(6px)" }),
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="no-scrollbar absolute inset-0 overflow-y-auto"
                  >
                    <View />
                  </motion.section>
                </AnimatePresence>
                <FlowBar scene={scene} go={go} />
              </main>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </NavCtx.Provider>
  );
}

function SideButton({ active, onClick, icon: Icon, label, small = false }: { active: boolean; onClick: () => void; icon: typeof Home; label: string; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex w-full items-center gap-3 rounded-[12px] px-3 text-left transition ${small ? "h-9 text-[14px]" : "h-10 text-[15px]"} ${active ? "text-cream-2" : "text-ivory/70 hover:bg-ivory/5 hover:text-cream-2"}`}
    >
      {active && <motion.span layoutId="side-active" className="absolute inset-0 rounded-[12px] border border-ivory/15 bg-ivory/10" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
      <Icon className="relative h-[18px] w-[18px]" strokeWidth={1.75} />
      <span className="relative">{label}</span>
    </button>
  );
}

/** Bottom bar inside each step: where you are, and one clear Next button. */
function FlowBar({ scene, go }: { scene: SceneId; go: (s: SceneId) => void }) {
  const p = pillarOf(scene);
  if (!p) return null;
  const i = p.items.findIndex((x) => x.id === scene);
  const nextPillar = PILLARS[PILLARS.indexOf(p) + 1];
  const next = p.items[i + 1] ?? (nextPillar ? { id: nextPillar.items[0].id, label: nextPillar.title } : { id: "today" as SceneId, label: "Home" });
  const prev = p.items[i - 1];
  const dark = scene === "fund";
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-5">
      <motion.div
        key={p.key}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className={`pointer-events-auto flex items-center gap-4 rounded-full border py-2 pl-5 pr-2 shadow-[0_20px_40px_-20px_rgba(15,26,43,0.5)] backdrop-blur-xl ${dark ? "border-ivory/15 bg-midnight/80 text-cream-2" : "border-midnight/10 bg-cream-2/85 text-navy"}`}
      >
        <span className={`text-sm ${dark ? "text-ivory" : "text-dusty-deep"}`}>Step {p.n} · {p.title}</span>
        <span className="flex gap-1.5">
          {p.items.map((x, j) => (
            <span key={x.id} className={`h-1.5 rounded-full transition-all ${j === i ? "w-6" : "w-1.5"} ${dark ? (j <= i ? "bg-cream-2" : "bg-ivory/30") : j <= i ? "bg-midnight" : "bg-midnight/25"}`} />
          ))}
        </span>
        {prev && (
          <button onClick={() => go(prev.id)} aria-label={`Back to ${prev.label}`} className={`flex h-10 w-10 items-center justify-center rounded-full ${dark ? "hover:bg-ivory/10" : "hover:bg-midnight/5"}`}>
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <button onClick={() => go(next.id)} className={`flex h-10 items-center gap-2 rounded-full px-5 text-sm font-medium ${dark ? "bg-cream-2 text-navy" : "bg-midnight text-cream-2"}`}>
          Next: {next.label} <ArrowRight className="h-4 w-4" />
        </button>
      </motion.div>
    </div>
  );
}
