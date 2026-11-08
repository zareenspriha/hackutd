"use client";
import { useEffect, useState } from "react";
import { MotionConfig, motion } from "motion/react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import Logo from "./Logo";
import Lantern from "./scenes/Lantern";
import { DemoProvider } from "./demo";
import { LiveProvider } from "@/lib/live";

/**
 * Insurer staff portal at /responders. Families never see a link to it.
 * Demo-level sign-in: any work email. Every responder action is signed with the name (X-Staff) and appears in
 * that family's own activity log. Responders load only the ranking, never a family's balances.
 */
const nameOf = (email: string) => {
  const local = email.split("@")[0] ?? "";
  return local.split(/[._-]/).filter(Boolean).map((p) => p[0]!.toUpperCase() + p.slice(1)).join(" ") || "Responder";
};
const KEY = "looma.staff";

export default function ResponderPortal() {
  const [staff, setStaff] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  useEffect(() => {
    try {
      setStaff(localStorage.getItem(KEY));
    } catch {}
    setReady(true);
  }, []);

  const signIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/.+@.+\..+/.test(email) || pw.length < 6) return;
    try {
      localStorage.setItem(KEY, email);
    } catch {}
    setStaff(email);
  };
  const signOut = () => {
    try {
      localStorage.removeItem(KEY);
    } catch {}
    setStaff(null);
  };

  if (!ready) return <div className="h-dvh bg-navy" />;

  return (
    <MotionConfig reducedMotion="user">
      <LiveProvider staffName={staff ? nameOf(staff) : null}>
        <DemoProvider>
          <div className="dark h-dvh overflow-hidden bg-navy">
            {staff ? (
              <Lantern staff={nameOf(staff)} onSignOut={signOut} />
            ) : (
              <div className="flex h-full items-center justify-center p-6">
                <motion.form
                  onSubmit={signIn}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full max-w-[420px] rounded-[28px] border border-ivory/10 bg-midnight p-8 text-cream-2"
                >
                  <span className="invert"><Logo width={92} animate={false} id="staff-logo" /></span>
                  <p className="mt-6 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ivory/70">
                    <ShieldCheck className="h-4 w-4" strokeWidth={1.75} /> Insurer staff only
                  </p>
                  <h1 className="mt-2 text-[30px] font-normal leading-tight">Sign in to the Lantern</h1>
                  <p className="mt-1 text-ivory/80">Recovery priority for your adjusters and outreach team.</p>
                  <label className="mt-6 block">
                    <span className="text-sm text-ivory">Work email</span>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" className="mt-1.5 h-12 w-full rounded-[14px] border border-ivory/15 bg-navy px-4 text-cream-2 outline-none focus:border-ivory" />
                  </label>
                  <label className="mt-3 block">
                    <span className="text-sm text-ivory">Password</span>
                    <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" className="mt-1.5 h-12 w-full rounded-[14px] border border-ivory/15 bg-navy px-4 text-cream-2 outline-none focus:border-ivory" />
                  </label>
                  <button disabled={!/.+@.+\..+/.test(email) || pw.length < 6} className="mt-6 flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-ivory font-medium text-navy disabled:opacity-40">
                    Sign in <ArrowRight className="h-4 w-4" />
                  </button>
                </motion.form>
              </div>
            )}
          </div>
        </DemoProvider>
      </LiveProvider>
    </MotionConfig>
  );
}
