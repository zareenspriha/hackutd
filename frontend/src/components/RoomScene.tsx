"use client";
/**
 * Stylized living-room frame used for the before/after demo (stands in for real video frames).
 * Coordinates are 0-1 of the frame so bounding boxes from the backend line up directly.
 * TODO (Scan & CV): swap for <img src={beforeFrameUrl|afterFrameUrl}> once the backend returns frames.
 */
type Box = { x: number; y: number; w: number; h: number };
const W = 160, H = 100;

export default function RoomScene({ phase, crop, className = "" }: { phase: "before" | "after"; crop?: Box; className?: string }) {
  const after = phase === "after";
  const vb = crop ? `${crop.x * W - 2} ${crop.y * H - 2} ${crop.w * W + 4} ${crop.h * H + 4}` : `0 0 ${W} ${H}`;
  const X = (v: number) => v * W, Y = (v: number) => v * H;

  return (
    <svg viewBox={vb} preserveAspectRatio={crop ? "xMidYMid slice" : "xMidYMid meet"} className={className} aria-hidden>
      <defs>
        <linearGradient id={`wall-${phase}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={after ? "#aeb6c6" : "#c6ccd9"} />
          <stop offset="1" stopColor={after ? "#9aa3b4" : "#b7bfcd"} />
        </linearGradient>
        <linearGradient id={`stain-${phase}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#8a6a3c" stopOpacity="0" />
          <stop offset="1" stopColor="#7a5530" stopOpacity="0.75" />
        </linearGradient>
      </defs>
      {/* wall + floor */}
      <rect width={W} height={Y(0.8)} fill={`url(#wall-${phase})`} />
      <rect y={Y(0.8)} width={W} height={Y(0.2)} fill={after ? "#8f8a80" : "#b9b4aa"} />
      {after && <rect y={Y(0.74)} width={W} height={Y(0.06)} fill="#52677d" opacity={0.35} />}
      {/* window */}
      <rect x={X(0.6)} y={Y(0.08)} width={X(0.2)} height={Y(0.24)} rx={1.5} fill={after ? "#d7dbe3" : "#e9ecf2"} stroke="#52677d" strokeWidth={0.8} />
      <line x1={X(0.7)} x2={X(0.7)} y1={Y(0.08)} y2={Y(0.32)} stroke="#52677d" strokeWidth={0.6} />
      {/* rug */}
      <rect x={X(0.08)} y={Y(0.85)} width={X(0.52)} height={Y(0.1)} rx={2} fill={after ? "#4a5a6c" : "#7d8ea3"} />
      {after && <rect x={X(0.08)} y={Y(0.85)} width={X(0.52)} height={Y(0.1)} rx={2} fill={`url(#stain-${phase})`} />}
      {/* floor lamp */}
      <rect x={X(0.075)} y={Y(0.34)} width={1.2} height={Y(0.47)} fill="#1c2e4a" />
      <path d={`M${X(0.045)},${Y(0.34)} L${X(0.115)},${Y(0.34)} L${X(0.1)},${Y(0.26)} L${X(0.06)},${Y(0.26)} Z`} fill="#d1cfc9" stroke="#1c2e4a" strokeWidth={0.5} />
      <ellipse cx={X(0.08)} cy={Y(0.81)} rx={4} ry={1.2} fill={after ? "#2a2f38" : "#1c2e4a"} />
      {/* desk */}
      <rect x={X(0.16)} y={Y(0.48)} width={X(0.38)} height={2.2} fill="#1c2e4a" />
      <rect x={X(0.17)} y={Y(0.5)} width={1.6} height={Y(0.3)} fill="#1c2e4a" />
      <rect x={X(0.52)} y={Y(0.5)} width={1.6} height={Y(0.3)} fill="#1c2e4a" />
      {/* laptop */}
      <rect x={X(0.21)} y={Y(0.39)} width={X(0.11)} height={Y(0.08)} rx={0.8} fill="#0f1a2b" />
      <rect x={X(0.215)} y={Y(0.4)} width={X(0.1)} height={Y(0.06)} fill="#52677d" />
      <rect x={X(0.2)} y={Y(0.47)} width={X(0.14)} height={1} fill="#0f1a2b" />
      {/* headphones (gone after) */}
      {!after && (
        <g fill="none" stroke="#0f1a2b" strokeWidth={1.4}>
          <path d={`M${X(0.37)},${Y(0.46)} A${X(0.035)},${Y(0.06)} 0 0 1 ${X(0.44)},${Y(0.46)}`} />
          <rect x={X(0.362)} y={Y(0.43)} width={3} height={4} rx={1} fill="#0f1a2b" />
          <rect x={X(0.43)} y={Y(0.43)} width={3} height={4} rx={1} fill="#0f1a2b" />
        </g>
      )}
      {/* water bottle */}
      <rect x={X(0.49)} y={Y(0.39)} width={X(0.025)} height={Y(0.085)} rx={1} fill="#52677d" />
      {/* chair */}
      <rect x={X(0.73)} y={Y(0.6)} width={X(0.15)} height={2} fill="#1c2e4a" />
      <rect x={X(0.86)} y={Y(0.4)} width={1.6} height={Y(0.4)} fill="#1c2e4a" />
      <rect x={X(0.74)} y={Y(0.61)} width={1.4} height={Y(0.19)} fill="#1c2e4a" />
      {/* backpack: floor before, chair after (moved) */}
      <g transform={after ? `translate(${X(-0.06)},${Y(-0.26)})` : ""}>
        <rect x={X(0.81)} y={Y(0.69)} width={X(0.1)} height={Y(0.16)} rx={3} fill="#3f5266" />
        <rect x={X(0.83)} y={Y(0.75)} width={X(0.06)} height={Y(0.06)} rx={1.5} fill="#52677d" />
      </g>
      {/* boxed appliance */}
      <rect x={X(0.57)} y={Y(0.61)} width={X(0.15)} height={Y(0.19)} fill="#c8b48e" />
      <rect x={X(0.635)} y={Y(0.61)} width={X(0.02)} height={Y(0.19)} fill="#b39d74" />
      {after && <rect x={X(0.57)} y={Y(0.61)} width={X(0.15)} height={Y(0.19)} fill={`url(#stain-${phase})`} />}
      {/* plant stand */}
      <rect x={X(0.9)} y={Y(0.6)} width={X(0.05)} height={Y(0.2)} fill="#1c2e4a" />
      <circle cx={X(0.925)} cy={Y(0.55)} r={5} fill="#6e9277" />
      {/* waterline on the wall after */}
      {after && <path d={`M0,${Y(0.74)} Q${X(0.25)},${Y(0.725)} ${X(0.5)},${Y(0.74)} T${W},${Y(0.735)}`} stroke="#7a5530" strokeOpacity={0.45} strokeWidth={0.8} fill="none" />}
    </svg>
  );
}
