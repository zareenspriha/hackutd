"use client";
import { motion } from "motion/react";

const MID = "#1c2e4a";
const NAVY = "#0f1a2b";
const BUTTER = "#d1cfc9";
const EASE = [0.22, 1, 0.36, 1] as const;

// One continuous body: in front of the first o, through its hole, behind its right side,
// across the gap, behind the second o's left side, and out the front of the second o.
const BODY = "M50,62 C60,84 74,116 116,118 C150,120 166,96 186,68";

/**
 * looma. wordmark. Letters are drawn as geometry (not a font) so the o's are true rings
 * and the cat's body can weave over and under them.
 */
export default function Logo({ width = 420, animate = true, id = "logo" }: { width?: number; animate?: boolean; id?: string }) {
  const a = animate;
  const fade = (delay: number) =>
    a ? { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.6, ease: EASE } } : {};
  const draw = a ? { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { delay: 0.6, duration: 1.4, ease: [0.65, 0, 0.35, 1] as const } } : {};
  const after = (delay: number) => (a ? { initial: { opacity: 0, scale: 0.8 }, animate: { opacity: 1, scale: 1 }, transition: { delay, duration: 0.45, ease: EASE } } : {});

  return (
    <svg viewBox="0 0 420 165" width={width} role="img" aria-label="looma.">
      <defs>
        <clipPath id={`${id}-c1`}>
          <rect x="93" y="98" width="18" height="36" />
        </clipPath>
        <clipPath id={`${id}-c2`}>
          <rect x="121" y="98" width="18" height="36" />
        </clipPath>
        {/* rings get a small gap wherever the body passes in front of them */}
        <mask id={`${id}-rings`} maskUnits="userSpaceOnUse">
          <rect width="420" height="165" fill="#fff" />
          <motion.path d={BODY} stroke="#000" strokeWidth={21} fill="none" strokeLinecap="round" {...draw} />
          <g clipPath={`url(#${id}-c1)`}><circle cx="72" cy="112" r="30" stroke="#fff" strokeWidth={11} fill="none" /></g>
          <g clipPath={`url(#${id}-c2)`}><circle cx="160" cy="112" r="30" stroke="#fff" strokeWidth={11} fill="none" /></g>
        </mask>
        {/* the body gets a small gap where it passes behind the rings */}
        <mask id={`${id}-body`} maskUnits="userSpaceOnUse">
          <rect width="420" height="165" fill="#fff" />
          <g clipPath={`url(#${id}-c1)`}><circle cx="72" cy="112" r="30" stroke="#000" strokeWidth={17} fill="none" /></g>
          <g clipPath={`url(#${id}-c2)`}><circle cx="160" cy="112" r="30" stroke="#000" strokeWidth={17} fill="none" /></g>
        </mask>
      </defs>

      {/* letters */}
      <g fill="none" stroke={MID} strokeWidth={11} strokeLinecap="round">
        <motion.path d="M20,40 V142" {...fade(0.05)} />
        <g mask={`url(#${id}-rings)`}>
          <motion.circle cx="72" cy="112" r="30" {...fade(0.12)} />
          <motion.circle cx="160" cy="112" r="30" {...fade(0.19)} />
        </g>
        <motion.path d="M207,142 V108 a22,22 0 0 1 44,0 V142 M251,108 a22,22 0 0 1 44,0 V142" {...fade(0.26)} />
        <motion.g {...fade(0.33)}>
          <circle cx="345" cy="112" r="30" />
          <path d="M375,82 V142" />
        </motion.g>
      </g>
      <motion.circle cx="398" cy="137" r="6.5" fill={MID} {...fade(0.4)} />

      {/* the cat's body, threaded through both o's */}
      <g mask={`url(#${id}-body)`}>
        <motion.path d={BODY} fill="none" stroke={NAVY} strokeWidth={15} strokeLinecap="round" {...draw} />
      </g>

      {/* back end: round haunch, two hind legs, curled tail */}
      <motion.g {...after(0.7)} style={{ transformOrigin: "50px 62px" }}>
        <ellipse cx="49" cy="63" rx="11" ry="9.5" transform="rotate(58 49 63)" fill={NAVY} />
        <g className={a ? "lm-leg" : ""}>
          <path d="M42,66 Q33,70 33,80" fill="none" stroke={NAVY} strokeWidth={5.5} strokeLinecap="round" />
          <ellipse cx="34" cy="81" rx="3.6" ry="2.6" fill={NAVY} />
        </g>
        <path d="M50,71 Q44,78 45,86" fill="none" stroke={NAVY} strokeWidth={5.5} strokeLinecap="round" />
        <ellipse cx="46" cy="87" rx="3.6" ry="2.6" fill={NAVY} />
        <path d="M46,55 C42,42 48,28 60,28 C69,28 70,39 63,40" fill="none" stroke={NAVY} strokeWidth={5} strokeLinecap="round" className={a ? "lm-tail" : ""} />
      </motion.g>

      {/* front end: paws and head */}
      <motion.g {...after(1.8)} style={{ transformOrigin: "190px 62px" }}>
        <path d="M180,80 L190,90 M172,86 L180,97" stroke={NAVY} strokeWidth={6} strokeLinecap="round" />
        <g className={a ? "lm-head" : ""}>
        <circle cx="194" cy="54" r="17" fill={NAVY} />
        <path d="M180,47 L181,30 L191,40 Z" fill={NAVY} />
        <path d="M208,47 L207,30 L197,40 Z" fill={NAVY} className={a ? "lm-ear" : ""} />
        <g className={a ? "lm-blink" : ""}>
          <ellipse cx="188" cy="54" rx="2.8" ry="3.8" fill={BUTTER} />
          <ellipse cx="200" cy="54" rx="2.8" ry="3.8" fill={BUTTER} />
          <ellipse cx="188" cy="54.5" rx="0.9" ry="2.8" fill={NAVY} />
          <ellipse cx="200" cy="54.5" rx="0.9" ry="2.8" fill={NAVY} />
        </g>
        </g>
      </motion.g>
    </svg>
  );
}
