"use client";
import { useState } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { getAuthClient } from "@/lib/firebase/client";
import { useRouter } from "next/navigation";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function submit() {
    setErr(null);
    const auth = getAuthClient();
    const fn = mode === "in" ? signInWithEmailAndPassword : createUserWithEmailAndPassword;
    try { await fn(auth, email, pw); router.push("/dashboard"); }
    catch (e) { setErr(e instanceof Error ? e.message : "Sign-in failed"); }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}>
        <h1 className="text-2xl font-bold mb-4">MyBuckets</h1>
        <input className="w-full mb-2 rounded-lg px-3 py-2 bg-transparent border" style={{ borderColor: "var(--color-border)" }}
          placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full mb-3 rounded-lg px-3 py-2 bg-transparent border" style={{ borderColor: "var(--color-border)" }}
          type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
        {err && <p className="text-sm mb-2" style={{ color: "#FF5E57" }}>{err}</p>}
        <button className="w-full rounded-lg py-2 font-semibold text-white" style={{ background: "var(--grad-brand)" }} onClick={submit}>
          {mode === "in" ? "Sign in" : "Create account"}
        </button>
        <button className="w-full mt-3 text-sm" style={{ color: "var(--color-muted)" }}
          onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
