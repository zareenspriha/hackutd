"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, BellRing, History, SwitchCamera, Sun, Upload, X } from "lucide-react";
import { Rise, Stage, useNav } from "../ui";
import { scannedItems } from "@/lib/mock";
import { usd } from "@/lib/format";
import { useLive, type LHomeRecord, type LScanResult } from "@/lib/live";
import { useDemo } from "../demo";
import type { Item } from "@/lib/types";

// Room used for live uploads, so the Garcias' other pre-scanned rooms stay as they are.
const LIVE_ROOM = "Office";
const LIVE_SPOTS: [number, number][] = [[14, 26], [52, 16], [66, 56], [10, 62], [40, 42], [34, 74], [70, 30], [24, 46], [58, 72], [80, 60]];

/** Scan response -> items to tag in the viewfinder (after: what's left, plus what's gone). */
function liveItems(r: LScanResult): Item[] {
  const seen = r.items.map((it, i) => ({
    id: `live${i}`, room: it.room, name: it.name, category: it.category,
    condition: (it.condition === "good" ? "good" : "damaged") as Item["condition"],
    replacementCost: it.replacement_cost, acv: it.actual_cash_value,
  }));
  const gone = r.losses.filter((l) => l.status === "missing").map((l, i) => ({
    id: `gone${i}`, room: l.room, name: l.name, category: l.category, condition: "missing" as const,
    replacementCost: l.replacement_cost, acv: l.actual_cash_value,
  }));
  return [...seen, ...gone];
}

type Phase = "before" | "after";
// preview: camera on, not recording yet (flip here) · camera: recording from the camera · recording: reading a video
type Status = "idle" | "preview" | "camera" | "recording" | "done";
const MAX_SECONDS = 30;
const ROOMS = ["Office", "Living room", "Kitchen", "Main bedroom", "Garage"];
const fmt = (d: string | null | undefined, year = false) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}) }) : "";

// Where each item's tag lands in the viewfinder (percent).
const spots: Record<string, [number, number]> = {
  i1: [14, 26], i2: [52, 16], i3: [66, 56], i4: [10, 62], i5: [40, 42], i6: [34, 74],
};

export default function Scan() {
  const { go } = useNav();
  const [phase, setPhase] = useState<Phase>("before");
  const [status, setStatus] = useState<Status>("idle");
  const [shown, setShown] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [secs, setSecs] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const live = useLive();
  const { toast } = useDemo();
  const fileInput = useRef<HTMLInputElement>(null);
  const [liveList, setLiveList] = useState<Item[] | null>(null);
  const [liveRoom, setLiveRoom] = useState(LIVE_ROOM);
  const room = live.data ? liveRoom : "Living room";
  // Home records: each room is recorded every 6 months, so there's always a recent baseline.
  const [rec, setRec] = useState<LHomeRecord | null>(null);
  useEffect(() => {
    if (live.data) live.homeRecord().then(setRec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.data]);
  const info = rec?.rooms.find((r) => r.room === room);
  const roomList = [...new Set([...ROOMS, ...(rec?.rooms.map((r) => r.room) ?? [])])];
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [camId, setCamId] = useState<string | null>(null);
  const [mirror, setMirror] = useState(false);
  const stopCamera = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => () => stopCamera(), []);
  // one <video> for preview and recording; re-attach whenever the stream changes
  useEffect(() => {
    if ((status === "preview" || status === "camera") && video.current && stream.current) {
      video.current.srcObject = stream.current;
      video.current.play().catch(() => {});
    }
  }, [status, camId]);

  /** Open a camera for preview (live mode). Back camera on phones; any camera on a Mac (FaceTime, iPhone via Continuity, USB). */
  async function startCamera(deviceId?: string) {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast("This browser can't record video. Pick a video instead.");
      return fileInput.current?.click();
    }
    try {
      const st = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1280 } } : { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });
      stopCamera();
      stream.current = st;
      const track = st.getVideoTracks()[0];
      const set = track?.getSettings() ?? {};
      // selfie cameras look natural mirrored (the saved video is not mirrored)
      setMirror(set.facingMode === "user" || (!set.facingMode && /facetime|front|built-in/i.test(track?.label ?? "")));
      setCamId(set.deviceId ?? deviceId ?? "default");
      setCams((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput"));
      setSecs(0);
      setStatus("preview");
    } catch {
      toast("Camera isn't available here. Pick a video instead.");
      fileInput.current?.click();
    }
  }

  /** Switch to the next camera (front/back on phones; FaceTime/iPhone/USB on a Mac). */
  function flipCamera() {
    if (cams.length < 2) return;
    const i = cams.findIndex((c) => c.deviceId === camId);
    startCamera(cams[(i + 1) % cams.length].deviceId);
  }

  function startRecording() {
    const st = stream.current;
    if (!st) return;
    const type = ["video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    const rec = new MediaRecorder(st, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      stopCamera();
      if (rec.ondataavailable === null) return; // cancelled
      const mime = (rec.mimeType || "video/webm").split(";")[0];
      const file = new File([new Blob(chunks, { type: mime })], `${liveRoom}-${phase}.${mime.includes("mp4") ? "mp4" : "webm"}`, { type: mime });
      upload(file);
    };
    recorder.current = rec;
    rec.start(500);
    setSecs(0);
    setStatus("camera");
    timers.current.push(setTimeout(() => rec.state === "recording" && rec.stop(), MAX_SECONDS * 1000));
  }
  const stopRecording = () => recorder.current?.state === "recording" && recorder.current.stop();
  /** Leave the camera without saving anything. */
  function cancelCamera() {
    const r = recorder.current;
    if (r && r.state === "recording") {
      r.ondataavailable = null;
      r.stop();
    }
    recorder.current = null;
    stopCamera();
  }

  const reset = (p: Phase) => {
    timers.current.forEach(clearTimeout);
    cancelCamera();
    setPhase(p);
    setStatus("idle");
    setShown(0);
    setSecs(0);
    setHint(null);
    setLiveList(null);
  };

  /** Real scan: upload the video, OpenCV checks it, Gemini lists the items. */
  async function upload(file: File) {
    timers.current.forEach(clearTimeout);
    setLiveList(null);
    setShown(0);
    setSecs(0);
    setStatus("recording");
    setHint("Reading your video…");
    try {
      const r = await live.scan(liveRoom, phase, file);
      const list = liveItems(r);
      setLiveList(list);
      setHint(r.quality.warnings[0] ?? r.missing_areas[0] ?? null);
      const t = timers.current;
      list.forEach((_, i) => t.push(setTimeout(() => setShown(i + 1), 300 + i * 450)));
      t.push(setTimeout(() => setStatus("done"), 300 + list.length * 450 + 300));
      t.push(setTimeout(() => setHint(null), 4000));
    } catch (e) {
      setStatus("idle");
      setHint(null);
      toast(e instanceof Error ? e.message : "Couldn't read that video. Try again.");
    }
  }

  // TODO (Scan & CV): replace with real upload -> POST /households/{id}/scan?phase=,
  // OpenCV blur/brightness hints, Gemini item list, before/after comparison.
  function record() {
    if (live.data) return void startCamera();
    setStatus("recording");
    const t = timers.current;
    scannedItems.forEach((_, i) => t.push(setTimeout(() => setShown(i + 1), 700 + i * 600)));
    t.push(setTimeout(() => setHint("Slow down a little"), 1400));
    t.push(setTimeout(() => setHint(null), 2900));
    t.push(setTimeout(() => setStatus("done"), 700 + scannedItems.length * 600 + 300));
  }

  useEffect(() => {
    if (status !== "recording" && status !== "camera") return;
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [status]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const items = (liveList ?? scannedItems).slice(0, shown);
  const losses = phase === "after" ? items.filter((i) => i.condition !== "good") : [];

  return (
    <Stage
      left={
        <>
          <Rise>
            <p className="eyebrow">{room}</p>
            <h1 className="headline mt-4 text-[72px]">
              {phase === "before" ? (
                <>Record your home. <span className="text-dusty">Every six months.</span></>
              ) : (
                <>Scan it again. <span className="text-dusty">See what changed.</span></>
              )}
            </h1>
            <p className="mt-5 max-w-md text-lg text-dusty-deep">
              {phase === "before"
                ? "Walk slowly around the room for 30 seconds while everything is fine. If a disaster ever hits, looma compares against your newest record."
                : "Walk the same path as your home record. looma lines the two up item by item."}
            </p>
          </Rise>

          {live.data && (
            <Rise delay={0.1} className="mt-6 flex flex-wrap gap-1.5">
              {roomList.map((r) => (
                <button key={r} onClick={() => (setLiveRoom(r), reset(phase))} className={`h-9 rounded-full px-4 text-sm transition ${r === liveRoom ? "bg-midnight text-cream-2" : "bg-cream-2/70 text-dusty-deep hover:text-navy"}`}>
                  {r}
                </button>
              ))}
            </Rise>
          )}
          <Rise delay={0.15} className="glass mt-4 inline-grid grid-cols-2 rounded-full p-1.5 text-sm">
            {(["before", "after"] as Phase[]).map((p) => (
              <button key={p} onClick={() => reset(p)} className="relative rounded-full px-6 py-2.5 font-medium">
                {phase === p && <motion.span layoutId="phase" className="absolute inset-0 rounded-full bg-midnight" />}
                <span className={`relative ${phase === p ? "text-butter" : "text-dusty-deep"}`}>
                  {p === "before" ? "Home record" : "After a disaster"}
                </span>
              </button>
            ))}
          </Rise>

          {live.data && status !== "done" && (
            <Rise delay={0.2} className="mt-5 max-w-md rounded-[20px] border border-navy/[0.08] bg-cream p-4 text-[15px]">
              {info?.last_recorded ? (
                <>
                  <p className="flex items-center gap-2 text-navy">
                    <History className="h-4 w-4 shrink-0 text-dusty-deep" strokeWidth={1.75} />
                    {phase === "before" ? "Last home record" : "Compared with your home record from"} <b className="font-medium">{fmt(info.last_recorded, true)}</b>
                  </p>
                  <p className="mt-1 pl-6 text-sm text-dusty-deep">
                    {info.records[0]?.items} things · {usd(info.records[0]?.value ?? 0)}
                    {info.records.length > 1 && <> · {info.records.length} records kept ({info.records.map((x) => fmt(x.taken_on, true)).join(" and ")})</>}
                  </p>
                  {phase === "before" && info.next_due && (
                    <p className={`mt-2 flex items-center gap-2 pl-6 text-sm ${info.overdue ? "text-clay" : "text-dusty-deep"}`}>
                      <BellRing className="h-3.5 w-3.5" strokeWidth={1.75} /> {info.overdue ? "Overdue since" : "Next one due"} {fmt(info.next_due, true)}
                    </p>
                  )}
                </>
              ) : (
                <p className="flex items-start gap-2 text-navy">
                  <History className="mt-0.5 h-4 w-4 shrink-0 text-dusty-deep" strokeWidth={1.75} />
                  {phase === "before"
                    ? "No home record for this room yet. Record it today and looma reminds you every six months."
                    : "This room has no home record yet, so there's nothing to compare to. Record one first, or add damage photos on your claim."}
                </p>
              )}
            </Rise>
          )}

          <AnimatePresence mode="wait">
            {status === "done" && (
              <motion.div key={phase} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-8">
                {phase === "before" ? (
                  <div className="glass max-w-md p-6">
                    <p className="text-[28px] font-light text-midnight">Home record saved. {items.length} things.</p>
                    <p className="mt-1 text-dusty-deep">
                      Saved privately. Only you can share it. {info?.next_due ? `We'll remind you to record it again on ${fmt(info.next_due)}.` : "We'll remind you in six months."}
                    </p>
                    <button onClick={() => reset("after")} className="pill-light mt-5">
                      Something happened? Scan after a disaster <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="max-w-md rounded-[28px] bg-midnight p-6 text-butter">
                    <p className="text-xs font-medium uppercase tracking-[0.22em] text-ivory">First look</p>
                    <p className="mt-2 text-[52px] font-light leading-none">{losses.length} {losses.length === 1 ? "thing" : "things"} changed</p>
                    <p className="mt-2 text-ivory">
                      {losses.map((l) => l.name).join(", ")}.
                    </p>
                    <button onClick={() => go("compare")} className="pill mt-5 bg-butter text-midnight hover:bg-white">
                      See what changed <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      }
      right={
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25, duration: 0.7 }}
          className="relative aspect-[4/3] overflow-hidden rounded-[40px] bg-[radial-gradient(120%_90%_at_30%_15%,#52677d,#1c2e4a_55%,#0f1a2b)] shadow-[0_40px_80px_-30px_rgba(15,26,43,0.6)]"
        >
          <div className="absolute inset-0 bg-[linear-gradient(rgba(209,207,201,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(209,207,201,0.06)_1px,transparent_1px)] bg-[size:33.33%_33.33%]" />
          {["left-6 top-6 border-l-2 border-t-2", "right-6 top-6 border-r-2 border-t-2", "left-6 bottom-6 border-l-2 border-b-2", "right-6 bottom-6 border-r-2 border-b-2"].map((c) => (
            <span key={c} className={`absolute h-10 w-10 rounded-sm border-butter/70 ${c}`} />
          ))}

          {(status === "preview" || status === "camera") && (
            <>
              <video ref={video} muted playsInline className={`absolute inset-0 h-full w-full object-cover ${mirror ? "-scale-x-100" : ""}`} />
              {status === "camera" ? (
                <div className="absolute left-8 top-8 flex items-center gap-2 rounded-full bg-navy/60 px-4 py-1.5 text-sm font-medium text-butter">
                  <motion.span className="h-2 w-2 rounded-full bg-clay" animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1, repeat: Infinity }} />
                  REC 0:{String(secs).padStart(2, "0")} / 0:{MAX_SECONDS}
                </div>
              ) : (
                <button onClick={() => (cancelCamera(), setStatus("idle"))} aria-label="Close camera" className="absolute left-8 top-8 flex h-10 w-10 items-center justify-center rounded-full bg-navy/60 text-butter backdrop-blur hover:bg-navy/80">
                  <X className="h-5 w-5" />
                </button>
              )}
              <div className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-2">
                <div className="relative flex items-center justify-center">
                  {status === "preview" ? (
                    <button onClick={startRecording} aria-label="Start recording" className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-butter/80 bg-navy/20 backdrop-blur transition hover:scale-105">
                      <span className="h-14 w-14 rounded-full bg-clay" />
                    </button>
                  ) : (
                    <button onClick={stopRecording} aria-label="Stop recording" className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-butter/80 bg-navy/30 backdrop-blur">
                      <span className="h-8 w-8 rounded-md bg-clay" />
                    </button>
                  )}
                  {status === "preview" && cams.length > 1 && (
                    <button onClick={flipCamera} aria-label="Switch camera" title="Switch camera"
                      className="absolute left-full ml-6 flex h-12 w-12 items-center justify-center rounded-full bg-navy/60 text-butter backdrop-blur transition hover:bg-navy/80">
                      <SwitchCamera className="h-5 w-5" strokeWidth={1.75} />
                    </button>
                  )}
                </div>
                <span className="rounded-full bg-navy/60 px-3 py-1 text-xs text-butter">
                  {status === "preview"
                    ? `${cams.find((c) => c.deviceId === camId)?.label.replace(/\s*\(.*\)$/, "") || "Camera"} · tap to start`
                    : "Walk slowly. Tap to finish."}
                </span>
              </div>
            </>
          )}

          {status === "recording" && (
            <>
              <motion.div
                className="absolute inset-x-0 h-32 bg-gradient-to-b from-transparent via-ivory/25 to-transparent"
                animate={{ top: ["-25%", "100%"] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
              />
              <div className="absolute left-8 top-8 flex items-center gap-2 rounded-full bg-navy/50 px-4 py-1.5 text-sm font-medium text-butter">
                <motion.span className="h-2 w-2 rounded-full bg-butter" animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1, repeat: Infinity }} />
                REC 0:{String(secs).padStart(2, "0")}
              </div>
            </>
          )}

          <AnimatePresence>
            {hint && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute right-8 top-8 flex items-center gap-2 rounded-full bg-butter px-4 py-1.5 text-sm font-medium text-midnight"
              >
                <Sun className="h-4 w-4" /> {hint}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {items.map((it) => {
              const [x, y] = spots[it.id] ?? LIVE_SPOTS[Number(it.id.replace(/\D/g, "")) % LIVE_SPOTS.length];
              const lost = phase === "after" && it.condition !== "good";
              return (
                <motion.div
                  key={it.id + phase}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="absolute"
                  style={{ left: `${x}%`, top: `${y}%` }}
                >
                  <div className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium shadow-lg ${lost ? "bg-navy text-butter ring-2 ring-butter/60" : "bg-butter/90 text-midnight"}`}>
                    <span className={it.condition === "missing" && lost ? "line-through" : ""}>{it.name}</span>
                    <span className="ml-2 opacity-60">{lost ? (it.condition === "missing" ? "gone" : "damaged") : usd(it.replacementCost)}</span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {status === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 text-center">
              <p className="text-ivory">{phase === "before" ? "Record the room as it is today" : "Record the same room after the disaster"}</p>
              <button onClick={record} aria-label="Start recording" className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-butter/80 transition hover:scale-105">
                <span className="h-16 w-16 rounded-full bg-butter" />
              </button>
              {live.data && (
                <>
                  <button onClick={() => fileInput.current?.click()} className="flex items-center gap-2 rounded-full bg-butter/15 px-5 py-2.5 text-sm font-medium text-butter transition hover:bg-butter/25">
                    <Upload className="h-4 w-4" strokeWidth={1.75} /> Upload a video instead
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) upload(f);
                    }}
                  />
                </>
              )}
            </div>
          )}
        </motion.div>
      }
    />
  );
}
