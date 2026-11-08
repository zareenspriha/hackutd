"use client";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { ArrowRight, Check, ClipboardCheck, MessageCircle } from "lucide-react";
import { LoomaSays } from "../Cat";
import { Messages, SafetyCheck, askLooma } from "../Trust";
import { firstName, useAuth } from "@/lib/auth";
import { sceneOf, useLive, type LClaimCheck } from "@/lib/live";
import { useDemo } from "../demo";
import { PILLARS } from "../pillars";
import { howTo } from "./Ask";
import { EASE, Rise, useNav } from "../ui";

/**
 * Home. Says plainly what looma does, in three steps, and points at the one to do now.
 */
export default function Today() {
  const { go } = useNav();
  const { s } = useDemo();
  const { user } = useAuth();
  const live = useLive();
  const day = live.data?.home.days_since_disaster ?? 2;
  const [check, setCheck] = useState<LClaimCheck | null>(null);
  useEffect(() => {
    if (live.data) live.claimCheck().then(setCheck);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.data]);
  const todo = live.data?.home.next_steps ?? [];
  const review = check?.checks.filter((c) => c.status === "review") ?? [];
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  const status = {
    prove: s.claimFiled ? "done" : "now",
    fund: s.bridgeTaken ? "done" : s.claimFiled ? "now" : "next",
    navigate: s.claimFiled && s.bridgeTaken ? "now" : "next",
  } as const;

  const message = !s.claimFiled
    ? "Let's start by proving what you lost. It takes about two minutes."
    : !s.bridgeTaken
      ? "Your claim is filed. Now let's get you money for this week."
      : "You're set for now. Ask me anything before you spend.";

  return (
    <div className="mx-auto flex min-h-full max-w-[1040px] flex-col justify-center px-10 pb-24 pt-10">
      <Rise>
        <p className="eyebrow">{today} · Day {day} after the disaster</p>
        <h1 className="headline mt-4 text-[56px]">
          Hi, {user ? firstName(user) : "there"}. <span className="text-dusty">We&apos;ll get through this in three steps.</span>
        </h1>
      </Rise>
      <div className="mt-6 max-w-xl">
        <LoomaSays delay={0.3}>{message}</LoomaSays>
      </div>

      <div className="mt-8 space-y-3">
        <Messages />
        <SafetyCheck />
      </div>

      {live.data && (todo.length > 0 || review.length > 0) && (
        <Rise delay={0.2} className="mt-6 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <div className="rounded-[22px] border border-navy/[0.08] bg-cream p-5">
            <p className="eyebrow">Your list · updated as things change</p>
            <ol className="mt-3 divide-y divide-navy/[0.06]">
              {todo.map((t, i) => (
                <li key={t.id} className="flex items-center gap-4 py-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${i === 0 ? "bg-midnight text-cream-2" : "border border-midnight/20 text-dusty-deep"}`}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[17px] text-navy">{t.title}</p>
                    <p className="text-sm text-dusty-deep">{t.why}</p>
                  </div>
                  <button onClick={() => (askLooma(howTo(t.title), t.id), go("ask"))}
                    aria-label={`Ask looma how to: ${t.title}`} className="flex h-9 w-9 items-center justify-center rounded-full text-dusty-deep hover:bg-cream-2 hover:text-navy">
                    <MessageCircle className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <button onClick={() => go(sceneOf(t.action))} className={`pill h-9 px-4 text-sm ${i === 0 ? "bg-midnight text-cream-2" : "border border-midnight/20 text-midnight hover:bg-cream-2"}`}>
                    Do it <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-[22px] border border-navy/[0.08] bg-cream p-5">
            <p className="eyebrow">To review</p>
            {review.length === 0 ? (
              <p className="mt-3 flex items-center gap-2 text-navy"><Check className="h-4 w-4 text-sage" /> Your claim passed every check.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {review.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => go(c.id === "reviewed" ? "compare" : "claim")} className="flex w-full gap-3 text-left">
                      <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber" strokeWidth={1.75} />
                      <span>
                        <span className="block text-[15px] text-navy">{c.label}</span>
                        <span className="block text-sm text-dusty-deep">{c.detail}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Rise>
      )}

      <div className="mt-6 grid grid-cols-3 gap-4">
        {PILLARS.map((p, i) => {
          const st = status[p.key];
          const isNow = st === "now";
          return (
            <motion.button
              key={p.key}
              onClick={() => go(p.items[0].id)}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1, duration: 0.4, ease: EASE }}
              className={`group flex min-h-[260px] flex-col rounded-[28px] p-7 text-left transition ${
                isNow ? "bg-midnight text-cream-2 shadow-[0_30px_60px_-30px_rgba(15,26,43,0.7)]" : "border border-navy/[0.08] bg-cream text-navy hover:bg-cream-2"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`flex h-10 w-10 items-center justify-center rounded-full text-lg ${st === "done" ? "bg-sage text-navy" : isNow ? "bg-cream-2 text-navy" : "border border-midnight/25 text-dusty-deep"}`}>
                  {st === "done" ? <Check className="h-5 w-5" strokeWidth={2.2} /> : p.n}
                </span>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${st === "done" ? "bg-sage/20 text-[#3f6248]" : isNow ? "bg-cream-2/15 text-cream-2" : "text-dusty-deep"}`}>
                  {st === "done" ? "Done" : isNow ? "Do this now" : "Up next"}
                </span>
              </div>
              <p className="mt-auto pt-10 text-[28px] font-normal leading-tight tracking-tight">{p.title}</p>
              <p className={`mt-2 ${isNow ? "text-ivory" : "text-dusty-deep"}`}>{p.blurb}</p>
              <span className={`mt-5 inline-flex items-center gap-2 text-sm font-medium ${isNow ? "text-cream-2" : "text-midnight"}`}>
                {st === "done" ? "Review" : "Start"} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
