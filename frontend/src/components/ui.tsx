"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleAlert } from "lucide-react";

export const SCENES = ["title", "today", "scan", "compare", "claim", "fund", "bills", "circle", "ask", "picture", "wait"] as const;
export type SceneId = (typeof SCENES)[number];

type Nav = { scene: SceneId; go: (s: SceneId) => void; next: () => void; back: () => void };
export const NavCtx = createContext<Nav>(null as unknown as Nav);
export const useNav = () => useContext(NavCtx);


/** Standard two-column scene frame: story on the left, stage on the right. */
export function Stage({ left, right, wideRight = false }: { left: React.ReactNode; right: React.ReactNode; wideRight?: boolean }) {
  return (
    <div className="mx-auto grid min-h-full w-full max-w-[1200px] grid-cols-12 items-center gap-10 px-12 pb-28 pt-12">
      <div className={wideRight ? "col-span-4" : "col-span-5"}>{left}</div>
      <div className={wideRight ? "col-span-8" : "col-span-7"}>{right}</div>
    </div>
  );
}

export function Rise({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + delay, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export const EASE = [0.22, 1, 0.36, 1] as const;

/** Status always shows icon + label + color. */
export function StatusPill({ status, label, dark = false }: { status: "good" | "warning" | "urgent"; label: string; dark?: boolean }) {
  const map = {
    good: { Icon: CheckCircle2, cls: dark ? "text-sage bg-sage/15" : "text-[#3f6248] bg-sage/20" },
    warning: { Icon: AlertTriangle, cls: dark ? "text-amber bg-amber/15" : "text-[#7a5a1f] bg-amber/25" },
    urgent: { Icon: CircleAlert, cls: dark ? "text-[#e08a7f] bg-clay/20" : "text-[#8e3a30] bg-clay/20" },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${map.cls}`}>
      <map.Icon className="h-3.5 w-3.5" strokeWidth={1.75} /> {label}
    </span>
  );
}

/** Small "Assumptions" disclosure under every number looma shows. */
export function Assumptions({ items, dark = false }: { items: string[]; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1 text-xs font-medium uppercase tracking-[0.14em] ${dark ? "text-ivory/80" : "text-dusty-deep"}`}
      >
        Assumptions <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: EASE }}
            className={`overflow-hidden text-sm ${dark ? "text-ivory/80" : "text-dusty-deep"}`}
          >
            {items.map((a) => (
              <li key={a} className="mt-1.5">· {a}</li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Money that counts up when it changes (600ms). */
export function CountUp({ value, className = "" }: { value: number; className?: string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => "$" + Math.round(v).toLocaleString("en-US"));
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.6, ease: EASE });
    return () => c.stop();
  }, [value, mv]);
  return <motion.span className={`tnum ${className}`}>{text}</motion.span>;
}
