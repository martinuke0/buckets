"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getAuthClient } from "@/lib/firebase/client";

type AuthUser = { uid: string; email: string | null } | null;
type AuthState = { user: AuthUser; loading: boolean };

const Ctx = createContext<AuthState>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });
  useEffect(() => {
    return onAuthStateChanged(getAuthClient(), (u) =>
      setState({ user: u ? { uid: u.uid, email: u.email } : null, loading: false }),
    );
  }, []);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
