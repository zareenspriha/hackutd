"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ArrowUp } from "lucide-react";
import Cat from "../Cat";
import { Assumptions, Rise, Stage, useNav } from "../ui";
import { api } from "@/lib/api";
import { useLive } from "@/lib/live";

type Rich =
  | { kind: "ladder"; rows: { label: string; amount: string; use: boolean }[] }
  | { kind: "when"; now: string; later: string; date: string }
  | { kind: "simulate" }
  | { kind: "picture" };
type Msg = { role: "user" | "looma"; text: string; rich?: Rich; next?: string; assumptions?: string[] };

// Scripted answers for the demo. TODO (coach): POST /households/{id}/coach returns these shapes.
const scripted: Record<string, Omit<Msg, "role">> = {
  "Can I afford a hotel for two weeks?": {
    text: "Yes. Two weeks at $89 a night is $1,246. Here's where it comes from, in order:",
    rich: {
      kind: "ladder",
      rows: [
        { label: "Bridge Funds", amount: "$1,246", use: true },
        { label: "Checking", amount: "untouched", use: false },
        { label: "CD, matures in 5 weeks", amount: "protected", use: false },
        { label: "IRA", amount: "protected", use: false },
      ],
    },
    next: "Snap the hotel receipt. It counts toward your claim.",
    assumptions: ["$89 a night for 14 nights", "Bridge Funds unlocked: $2,480"],
  },
  "What do I have?": {
    text: "You can spend $1,540 today. $2,480 in Bridge Funds is waiting, and $8,420 is coming from the claim.",
    rich: { kind: "picture" },
    next: "Unlock your Bridge Funds.",
    assumptions: ["Checking $640 + savings $900", "Claim pays around Nov 29"],
  },
  "Can I still take that vacation?": {
    text: "Not this month, but you don't have to cancel it. Your claim should pay around Nov 29. After that:",
    rich: { kind: "when", now: "Tight until the claim pays", later: "A $600 trip fits without touching your CD", date: "January" },
    next: "Move the deposit date to January instead of canceling.",
    assumptions: ["Claim pays around Nov 29", "Trip costs about $600"],
  },
  "What if my claim takes six weeks?": {
    text: "You'd be about $221 short around Dec 19. Pausing the mortgage covers it. Try it yourself:",
    rich: { kind: "simulate" },
    next: "Call your lender about a disaster payment pause.",
    assumptions: ["Same spending as today", "Paycheck arrives on time"],
  },
};

export default function Ask() {
  const live = useLive();
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "looma", text: "I can see your accounts, your claim, and what's coming in. Ask me anything. No question is too small." },
  ]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);

  async function send(q: string) {
    if (!q.trim()) return;
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setTyping(true);
    const known = scripted[q];
    // Live: the real coach answers everything (numbers from the engines, wording from Gemini).
    const fromCoach = live.data ? await live.coach(q) : null;
    const reply: Omit<Msg, "role"> = fromCoach
      ? {
          text: fromCoach.answer.replace(/\s*Next step: .*$/, ""), // shown separately below the answer
          next: fromCoach.next_step?.title,
          assumptions: fromCoach.assumptions.slice(0, 3),
        }
      : known ?? (await api.coach("garcia", q).then((r) => ({ text: r.answer, next: r.nextStep })));
    setTimeout(() => {
      setTyping(false);
      setMsgs((m) => [...m, { role: "looma", ...reply }]);
    }, 1100);
  }

  const asked = new Set(msgs.filter((m) => m.role === "user").map((m) => m.text));
  const chips = Object.keys(scripted).filter((q) => !asked.has(q));

  return (
    <Stage
      left={
        <>
          <Rise>
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 16, delay: 0.2 }}>
              <Cat size={72} />
            </motion.div>
            <p className="eyebrow mt-8">Ask looma</p>
            <h1 className="headline mt-4 text-[72px]">
              Just ask. <span className="text-dusty">Plain answers.</span>
            </h1>
            <p className="mt-5 max-w-md text-lg text-dusty-deep">
              looma knows every account, the claim, and what&apos;s coming in. Every answer shows its math and ends with one next step.
            </p>
          </Rise>
          <Rise delay={0.2} className="mt-8 flex max-w-md flex-col items-start gap-2.5">
            <AnimatePresence>
              {chips.map((q) => (
                <motion.button
                  key={q}
                  layout
                  exit={{ opacity: 0, x: -10 }}
                  onClick={() => send(q)}
                  className="rounded-full border border-midnight/20 bg-white/30 px-5 py-2.5 text-[15px] text-midnight transition hover:bg-white/60"
                >
                  {q}
                </motion.button>
              ))}
            </AnimatePresence>
          </Rise>
        </>
      }
      right={
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7 }}
          className="glass flex h-[620px] flex-col p-6"
        >
          <div ref={scroller} className="no-scrollbar flex-1 space-y-4 overflow-y-auto pr-1">
            {msgs.map((m, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={m.role === "user" ? "flex justify-end" : "flex items-end gap-3"}>
                {m.role === "user" ? (
                  <p className="max-w-[70%] rounded-3xl rounded-br-md bg-midnight px-5 py-3 text-[16px] text-butter">{m.text}</p>
                ) : (
                  <>
                    <Cat size={28} blink={false} />
                    <div className="max-w-[80%] rounded-3xl rounded-bl-md bg-white/55 p-5">
                      <p className="text-[16px] leading-relaxed text-midnight"><Headline text={m.text} /></p>
                      {m.rich && <RichCard r={m.rich} />}
                      {m.assumptions && <Assumptions items={m.assumptions} />}
                      {m.next && (
                        <p className="mt-4 border-t border-ivory pt-3 text-[15px] text-midnight">
                          <span className="eyebrow mr-2">Next</span>
                          {m.next}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </motion.div>
            ))}
            {typing && (
              <div className="flex items-end gap-3">
                <Cat size={28} blink={false} />
                <div className="inline-flex gap-1.5 rounded-3xl rounded-bl-md bg-white/55 px-5 py-4">
                  {[0, 1, 2].map((d) => (
                    <motion.span key={d} className="h-2 w-2 rounded-full bg-dusty" animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.9, repeat: Infinity, delay: d * 0.15 }} />
                  ))}
                </div>
              </div>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="mt-4 flex items-center gap-2 rounded-full bg-white/50 p-1.5 pl-6"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your money…"
              className="flex-1 bg-transparent text-[16px] text-midnight outline-none placeholder:text-dusty/70"
            />
            <button aria-label="Send" className="flex h-11 w-11 items-center justify-center rounded-full bg-midnight text-butter">
              <ArrowUp className="h-4 w-4" />
            </button>
          </form>
        </motion.div>
      }
    />
  );
}

function RichCard({ r }: { r: Rich }) {
  const { go } = useNav();
  if (r.kind === "ladder")
    return (
      <ol className="mt-4 space-y-1.5">
        {r.rows.map((row, i) => (
          <motion.li
            key={row.label}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 * i }}
            className={`flex items-center justify-between rounded-2xl px-4 py-2.5 ${row.use ? "bg-midnight text-butter" : "bg-butter/60 text-midnight"}`}
          >
            <span>
              <span className="mr-3 opacity-50">{i + 1}</span>
              {row.label}
            </span>
            <span className={row.use ? "font-medium" : "text-dusty-deep"}>{row.amount}</span>
          </motion.li>
        ))}
      </ol>
    );
  if (r.kind === "when")
    return (
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-butter/60 p-4">
          <p className="eyebrow">Now</p>
          <p className="mt-1 text-midnight">{r.now}</p>
        </div>
        <div className="rounded-2xl bg-midnight p-4 text-butter">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-ivory">{r.date}</p>
          <p className="mt-1">{r.later}</p>
        </div>
      </div>
    );
  if (r.kind === "picture")
    return (
      <button onClick={() => go("picture")} className="pill-dark mt-4">
        See my money <ArrowRight className="h-4 w-4" />
      </button>
    );
  return (
    <button onClick={() => go("wait")} className="pill-dark mt-4">
      Try it <ArrowRight className="h-4 w-4" />
    </button>
  );
}

function Headline({ text }: { text: string }) {
  const i = text.indexOf(". ");
  if (i === -1) return <>{text}</>;
  return (
    <>
      <b className="font-semibold">{text.slice(0, i + 1)}</b>
      {text.slice(i + 1)}
    </>
  );
}
