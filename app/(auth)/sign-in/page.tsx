"use client";
import { useState } from "react";
import { GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { getAuthClient } from "@/lib/firebase/client";
import { useRouter } from "next/navigation";

export default function SignIn() {
  const [err, setErr] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  async function signInWithGoogle() {
    setErr(null);
    try {
      await signInWithPopup(getAuthClient(), new GoogleAuthProvider());
      router.push("/dashboard");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign-in failed");
    }
  }

  async function signInWithDev() {
    setErr(null);
    try {
      await signInWithEmailAndPassword(getAuthClient(), email, password);
      router.push("/dashboard");
    } catch (e) {
      if (e instanceof Error && (e.message.includes("auth/user-not-found") || e.message.includes("auth/invalid-credential"))) {
        try {
          await createUserWithEmailAndPassword(getAuthClient(), email, password);
          router.push("/dashboard");
        } catch (createErr) {
          setErr(createErr instanceof Error ? createErr.message : "Account creation failed");
        }
      } else {
        setErr(e instanceof Error ? e.message : "Sign-in failed");
      }
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}>
        <h1 className="text-2xl font-bold mb-1">Buckets</h1>
        <p className="text-sm mb-6" style={{ color: "var(--color-muted)" }}>
          Auto-split your income. Always know what&apos;s safe to spend.
        </p>
        {err && <p className="text-sm mb-3" style={{ color: "var(--color-danger)" }}>{err}</p>}
        <button
          className="w-full rounded-lg py-2.5 font-semibold text-white"
          style={{ background: "var(--grad-brand)" }}
          onClick={signInWithGoogle}
        >
          Continue with Google
        </button>
        {process.env.NODE_ENV === "development" && (
          <div className="mt-6 pt-6" style={{ borderTop: "1px solid var(--color-border)" }}>
            <p className="text-xs mb-3" style={{ color: "var(--color-muted)" }}>Dev sign-in</p>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full mb-2 px-3 py-2 rounded-lg text-sm"
              style={{ background: "var(--color-input)", border: "1px solid var(--color-border)" }}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full mb-3 px-3 py-2 rounded-lg text-sm"
              style={{ background: "var(--color-input)", border: "1px solid var(--color-border)" }}
            />
            <button
              className="w-full rounded-lg py-2.5 font-semibold"
              style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}
              onClick={signInWithDev}
            >
              Sign in (dev)
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
