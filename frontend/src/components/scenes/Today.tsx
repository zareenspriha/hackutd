"use client";
import { motion } from "motion/react";
import { ArrowRight, Check } from "lucide-react";
import { LoomaSays } from "../Cat";
import { Messages, SafetyCheck } from "../Trust";
import { firstName, useAuth } from "@/lib/auth";
import { useLive } from "@/lib/live";
import { useDemo } from "../demo";
import { PILLARS } from "../pillars";
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
