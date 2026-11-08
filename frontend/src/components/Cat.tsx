"use client";
import { motion } from "motion/react";

/** looma's cat on its own (sitting), used as the guide's avatar. */
export default function Cat({ size = 40, blink = true, light = false }: { size?: number; blink?: boolean; light?: boolean }) {
  const body = light ? "#d1cfc9" : "#0f1a2b";
  const eye = light ? "#0f1a2b" : "#d1cfc9";
  return (
    <svg viewBox="118 34 52 76" width={size} height={(size * 76) / 52} aria-hidden className="shrink-0">
      <path d="M123,108 C120,90 128,75 140,73 C152,75 160,90 157,108 Z" fill={body} />
      <path d="M156,104 Q166,108 166,96 Q166,86 160,84" fill="none" stroke={body} strokeWidth={4} strokeLinecap="round" />
      <circle cx={140} cy={62} r={15} fill={body} />
      <path d="M127,57 L128.5,38 L138,49 Z" fill={body} />
      <path d="M153,57 L151.5,38 L142,49 Z" fill={body} />
      <motion.g
        style={{ transformOrigin: "140px 62px" }}
        animate={blink ? { scaleY: [1, 1, 0.1, 1] } : undefined}
        transition={{ duration: 3.5, times: [0, 0.92, 0.95, 1], repeat: Infinity }}
      >
        <ellipse cx={134} cy={62} rx={2.8} ry={3.6} fill={eye} />
        <ellipse cx={146} cy={62} rx={2.8} ry={3.6} fill={eye} />
        <ellipse cx={134} cy={62.5} rx={0.9} ry={2.8} fill={body} />
        <ellipse cx={146} cy={62.5} rx={0.9} ry={2.8} fill={body} />
      </motion.g>
    </svg>
  );
}

export function LoomaSays({ children, delay = 0.2 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className="flex items-end gap-3"
    >
      <Cat size={38} />
      <div className="glass rounded-bl-md px-5 py-3.5 text-[16px] leading-snug text-midnight">{children}</div>
    </motion.div>
  );
}
