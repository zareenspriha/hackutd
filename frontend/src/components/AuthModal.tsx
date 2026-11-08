"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, Landmark, Lock, X } from "lucide-react";
import Logo from "./Logo";
import { useAuth } from "@/lib/auth";

export type AuthMode = "signup" | "login";
const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Sign up: account → link your bank → in. Log in: email + password → in.
 * Demo level: no password is sent anywhere; see lib/auth.tsx.
 */
export default function AuthModal({ mode, onClose, onDone }: { mode: AuthMode | null; onClose: () => void; onDone: () => void }) {
  const { signUp, logIn, linkBank } = useAuth();
  const [m, setM] = useState<AuthMode>("signup");
  const [step, setStep] = useState<"form" | "bank" | "linking">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");

  useEffect(() => {
    if (mode) {
      setM(mode);
      setStep("form");
    }
  }, [mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const valid = /.+@.+\..+/.test(email) && pw.length >= 6 && (m === "login" || name.trim().length > 1);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    if (m === "signup") {
      signUp(name, email);
      setStep("bank");
    } else {
      logIn(email);
      onDone();
    }
  }

  function connectBank() {
    setStep("linking");
    setTimeout(() => {
      linkBank();
      onDone();
    }, 1400);
  }

  return (
    <AnimatePresence>
      {mode && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-navy/40 p-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={m === "signup" ? "Sign up" : "Log in"}
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="relative w-full max-w-[440px] rounded-[28px] bg-cream-2 p-8 shadow-[0_40px_80px_-30px_rgba(15,26,43,0.6)]"
          >
            <button onClick={onClose} aria-label="Close" className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full text-dusty-deep hover:bg-cream">
              <X className="h-5 w-5" />
            </button>
            <Logo width={92} animate={false} id="auth-logo" />

            <AnimatePresence mode="wait">
              {step === "form" && (
                <motion.form key={"form" + m} onSubmit={submit} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.22 }}>
                  <h2 className="mt-6 text-[30px] font-normal leading-tight tracking-tight text-navy">
                    {m === "signup" ? "Create your account" : "Welcome back"}
                  </h2>
                  <p className="mt-1 text-dusty-deep">{m === "signup" ? "It takes a minute. Your data stays private." : "Log in to see your recovery plan."}</p>

                  <div className="mt-6 space-y-3">
                    {m === "signup" && <Field label="Full name" value={name} onChange={setName} autoComplete="name" />}
                    <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
                    <Field label="Password" type="password" value={pw} onChange={setPw} autoComplete={m === "signup" ? "new-password" : "current-password"} hint={m === "signup" ? "At least 6 characters" : undefined} />
                  </div>

                  <button disabled={!valid} className="pill-dark mt-6 h-[52px] w-full rounded-[14px] disabled:opacity-40">
                    {m === "signup" ? "Create account" : "Log in"} <ArrowRight className="h-4 w-4" />
                  </button>
                  <p className="mt-4 text-center text-sm text-dusty-deep">
                    {m === "signup" ? "Already have an account? " : "New to looma? "}
                    <button type="button" onClick={() => setM(m === "signup" ? "login" : "signup")} className="font-medium text-midnight underline underline-offset-4">
                      {m === "signup" ? "Log in" : "Sign up"}
                    </button>
                  </p>
                </motion.form>
              )}

              {step === "bank" && (
                <motion.div key="bank" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.22 }}>
                  <h2 className="mt-6 text-[30px] font-normal leading-tight tracking-tight text-navy">Link your bank</h2>
                  <p className="mt-1 text-dusty-deep">looma reads your balances and bills so every number is yours. It never moves money without you.</p>
                  <div className="mt-6 flex items-center gap-4 rounded-[20px] border border-navy/[0.08] bg-cream p-5">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-midnight text-cream-2">
                      <Landmark className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <div>
                      <p className="font-medium text-navy">Your bank</p>
                      <p className="text-sm text-dusty-deep">Sandbox connection for the demo</p>
                    </div>
                  </div>
                  <p className="mt-4 flex items-center gap-2 text-sm text-dusty-deep">
                    <Lock className="h-4 w-4" strokeWidth={1.75} /> Read-only. You can disconnect anytime.
                  </p>
                  <button onClick={connectBank} className="pill-dark mt-6 h-[52px] w-full rounded-[14px]">
                    Connect <ArrowRight className="h-4 w-4" />
                  </button>
                </motion.div>
              )}

              {step === "linking" && (
                <motion.div key="linking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-12 text-center">
                  <motion.span
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-midnight text-cream-2"
                    initial={{ scale: 0.8 }}
                    animate={{ scale: [0.8, 1, 0.95, 1] }}
                    transition={{ duration: 1.2 }}
                  >
                    <Check className="h-6 w-6" />
                  </motion.span>
                  <p className="mt-5 text-lg text-navy">Reading your accounts…</p>
                  <p className="text-sm text-dusty-deep">Building your recovery plan</p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({ label, value, onChange, type = "text", autoComplete, hint }: { label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string; hint?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-navy">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="mt-1.5 h-12 w-full rounded-[14px] border border-navy/[0.12] bg-white/60 px-4 text-[15px] text-navy outline-none transition focus:border-midnight"
      />
      {hint && <span className="mt-1 block text-xs text-dusty-deep">{hint}</span>}
    </label>
  );
}
