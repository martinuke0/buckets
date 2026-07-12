"use client";
import { useState } from "react";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { getAuthClient } from "@/lib/firebase/client";
import { useRouter } from "next/navigation";

export default function SignIn() {
  const [err, setErr] = useState<string | null>(null);
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

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}>
        <h1 className="text-2xl font-bold mb-1">MyBuckets</h1>
        <p className="text-sm mb-6" style={{ color: "var(--color-muted)" }}>
          Auto-split your income. Always know what&apos;s safe to spend.
        </p>
        {err && <p className="text-sm mb-3" style={{ color: "#FF5E57" }}>{err}</p>}
        <button
          className="w-full rounded-lg py-2.5 font-semibold text-white"
          style={{ background: "var(--grad-brand)" }}
          onClick={signInWithGoogle}
        >
          Continue with Google
        </button>
      </div>
    </main>
  );
}
