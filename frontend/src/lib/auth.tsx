"use client";
/**
 * Family accounts (demo level). Every personal screen sits behind sign-in.
 * TODO (backend): replace with real accounts (POST /auth/signup, /auth/login) that map a user to their household.
 * For the hackathon, every account opens the Garcia household, the only one with full demo data.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type User = { name: string; email: string; household: string; bankLinked: boolean };
type Auth = {
  user: User | null;
  ready: boolean;
  signUp: (name: string, email: string) => void;
  logIn: (email: string) => void;
  linkBank: () => void;
  logOut: () => void;
};

const KEY = "looma.user";
const AuthCtx = createContext<Auth>(null as unknown as Auth);
export const useAuth = () => useContext(AuthCtx);

const read = (): User | null => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
};
const write = (u: User | null) => {
  try {
    if (u) localStorage.setItem(KEY, JSON.stringify(u));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: stays signed in for this tab only */
  }
};

export const firstName = (u: User) => u.name.split(" ")[0] || "there";
export const initials = (u: User) =>
  u.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "•";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(read());
    setReady(true);
  }, []);

  const save = useCallback((u: User | null) => {
    setUser(u);
    write(u);
  }, []);

  const value: Auth = {
    user,
    ready,
    signUp: (name, email) => save({ name: name.trim(), email: email.trim(), household: "garcia", bankLinked: false }),
    logIn: (email) => save(read()?.email === email.trim() ? read() : { name: "Maria Garcia", email: email.trim(), household: "garcia", bankLinked: true }),
    linkBank: () => user && save({ ...user, bankLinked: true }),
    logOut: () => save(null),
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
