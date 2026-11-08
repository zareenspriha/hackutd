"use client";
/**
 * Real street map (OpenStreetMap tiles) with two fast layers on top:
 * - a canvas for thousands of households (and the storm front), redrawn every frame
 * - DOM pins (overlay render prop) for a handful of interactive markers like ATMs
 * Client-only: import it with next/dynamic and ssr: false.
 */
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapPoint = { id: string; lat: number; lng: number; color: string; r: number; opacity: number; glow?: boolean };
export type Project = (lat: number, lng: number) => { x: number; y: number };

// Standard OpenStreetMap tiles (no key), tinted with CSS to match looma's palette.
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TINT = {
  dark: "invert(1) hue-rotate(195deg) saturate(0.35) brightness(0.78) contrast(0.92)",
  light: "grayscale(0.85) sepia(0.12) brightness(1.04) contrast(0.92)",
};

export default function RealMap({
  theme = "dark",
  bounds,
  center,
  zoom = 14,
  points = [],
  selected,
  stormLng = null,
  onPick,
  overlay,
  className = "",
}: {
  theme?: "dark" | "light";
  bounds?: [[number, number], [number, number]];
  center?: [number, number];
  zoom?: number;
  points?: MapPoint[];
  selected?: { lat: number; lng: number } | null;
  /** storm front longitude; households east of it are still waiting */
  stormLng?: number | null;
  onPick?: (id: string) => void;
  overlay?: (project: Project) => React.ReactNode;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const map = useRef<L.Map | null>(null);
  const latest = useRef({ points, selected, stormLng, onPick });
  latest.current = { points, selected, stormLng, onPick };
  const [, setMoved] = useState(0); // re-render DOM pins when the map moves

  useEffect(() => {
    if (!box.current || map.current) return;
    const m = L.map(box.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: true, zoomSnap: 0.25 });
    L.tileLayer(TILES, {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    m.getPane("tilePane")!.style.filter = TINT[theme];
    if (bounds) m.fitBounds(bounds, { padding: [8, 8] });
    else if (center) m.setView(center, zoom);
    L.control.zoom({ position: "bottomright" }).addTo(m);
    const bump = () => setMoved((n) => n + 1);
    m.on("move zoom resize", bump);
    // click picks the nearest household within 10px (the canvas lets drags through to the map)
    m.on("click", (e: L.LeafletMouseEvent) => {
      const { points: pts, onPick: cb } = latest.current;
      if (!cb) return;
      let best: string | null = null, bd = 100;
      for (const p of pts) {
        const q = m.latLngToContainerPoint([p.lat, p.lng]);
        const d = (q.x - e.containerPoint.x) ** 2 + (q.y - e.containerPoint.y) ** 2;
        if (d < bd) (bd = d), (best = p.id);
      }
      if (best) cb(best);
    });
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // one animation loop draws households, the storm and the selection pulse
  useEffect(() => {
    let raf = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      const m = map.current, c = canvas.current;
      if (!m || !c) return;
      const { width, height } = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (c.width !== Math.round(width * dpr)) (c.width = Math.round(width * dpr)), (c.height = Math.round(height * dpr));
      const g = c.getContext("2d")!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, width, height);
      const { points: pts, selected: sel, stormLng: storm } = latest.current;
      const scale = Math.max(0.7, Math.min(2.2, (m.getZoom() - 9) / 1.6));

      // storm: a soft band trailing the front, rain streaks, and a bright leading edge
      if (storm !== null) {
        const fx = m.latLngToContainerPoint([m.getCenter().lat, storm]).x;
        const w = width * 0.38;
        const grad = g.createLinearGradient(fx - w, 0, fx, 0);
        grad.addColorStop(0, "rgba(189,196,212,0)");
        grad.addColorStop(1, "rgba(189,196,212,0.28)");
        g.fillStyle = grad;
        g.fillRect(fx - w, 0, w, height);
        g.strokeStyle = "rgba(242,241,238,0.25)";
        g.lineWidth = 1;
        const off = (t / 6) % 18;
        for (let x = fx - w; x < fx; x += 9) {
          for (let y = -20 + off; y < height; y += 18) {
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x - 3, y + 9);
            g.stroke();
          }
        }
        g.shadowColor = "rgba(242,241,238,0.8)";
        g.shadowBlur = 24;
        g.fillStyle = "rgba(242,241,238,0.85)";
        g.fillRect(fx - 1.5, 0, 3, height);
        g.shadowBlur = 0;
      }

      for (const p of pts) {
        const { x, y } = m.latLngToContainerPoint([p.lat, p.lng]);
        if (x < -10 || y < -10 || x > width + 10 || y > height + 10) continue;
        g.globalAlpha = p.opacity;
        if (p.glow) {
          g.shadowColor = p.color;
          g.shadowBlur = 10;
        }
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(x, y, p.r * scale, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
      }
      g.globalAlpha = 1;

      if (sel) {
        const { x, y } = m.latLngToContainerPoint([sel.lat, sel.lng]);
        const k = (t % 1600) / 1600;
        g.strokeStyle = `rgba(242,241,238,${1 - k})`;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x, y, 6 + k * 20, 0, Math.PI * 2);
        g.stroke();
        g.strokeStyle = "#f2f1ee";
        g.beginPath();
        g.arc(x, y, 6, 0, Math.PI * 2);
        g.stroke();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const project: Project = (lat, lng) => (map.current ? map.current.latLngToContainerPoint([lat, lng]) : { x: -999, y: -999 });

  return (
    <div className={`${/\b(absolute|fixed)\b/.test(className) ? "" : "relative "}overflow-hidden ${className}`}>
      <div ref={box} className={`absolute inset-0 ${theme === "dark" ? "bg-[#0e1626]" : "bg-[#e6e4df]"}`} />
      <canvas ref={canvas} className="pointer-events-none absolute inset-0 z-[400] h-full w-full" />
      {overlay && map.current && <div className="pointer-events-none absolute inset-0 z-[450] [&>*]:pointer-events-auto">{overlay(project)}</div>}
    </div>
  );
}
