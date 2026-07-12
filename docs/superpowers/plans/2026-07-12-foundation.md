# MyBuckets Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js PWA + Firebase (Auth, Firestore, EU region) foundation with the shared data model, design tokens, and navigation shell that every later subsystem builds on.

**Architecture:** A Next.js App Router PWA (installable, web-push capable) talks to Firebase Auth for identity and Firestore (EU region) for data. Shared TypeScript types + pure helpers define the data model once and are imported by both client and Cloud Functions. A bottom-tab nav shell hosts the four app sections. This plan delivers a running, sign-in-able app with empty section screens — no business logic yet.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind CSS v4, Firebase JS SDK v11 (Auth + Firestore), Vitest + React Testing Library, `firebase-admin` for server code.

## Global Constraints

- **EU data residency:** Firestore database created in an EU region (`eur3` or `europe-west1`). Copy verbatim into `firebase.json` / provisioning notes.
- **Secrets server-side only:** Firebase *web* config (apiKey etc.) is public by design and may ship in the client bundle; all other keys (GoCardless, Stripe, Gemini, `firebase-admin` service account) live only in server env / Cloud Functions config — never imported into `app/` client components.
- **Money type:** all monetary amounts are integer **minor units** (euro cents), never floats. Currency is `EUR` for MVP.
- **No emojis in UI.** Bucket identity = accent-color dot + plain name.
- **Design tokens (dark theme):** base `#0E0F13`, card `#1A1C22`, border `#2A2D35`, text `#E8EAED`, muted `#8A8F98`, gradient `#9945FF → #14F195`, danger gradient `#FF8A3D → #FF5E57`.
- **TDD:** every non-trivial pure function gets a failing test first. Commit after each green step.

---

## File Structure

- `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts` — project config.
- `app/globals.css` — Tailwind import + design-token CSS variables.
- `app/layout.tsx` — root layout, theme, PWA manifest link.
- `app/(app)/layout.tsx` — authenticated shell with bottom tab bar.
- `app/(app)/dashboard/page.tsx`, `buckets/page.tsx`, `coach/page.tsx`, `settings/page.tsx` — placeholder section screens.
- `app/(auth)/sign-in/page.tsx` — sign-in screen.
- `public/manifest.webmanifest` — PWA manifest.
- `lib/model/types.ts` — shared domain types (`User`, `Bucket`, `Transaction`, `Allocation`, `Consent`).
- `lib/model/money.ts` — money helpers (pure, tested).
- `lib/model/paths.ts` — Firestore collection-path helpers (pure, tested).
- `lib/firebase/client.ts` — client Firebase init (Auth + Firestore).
- `lib/auth/AuthProvider.tsx` — React context exposing the current user.
- `components/nav/BottomTabBar.tsx` — the four-tab navigation.
- `firestore.rules` — per-user access rules.
- `firebase.json`, `.firebaserc` — Firebase project + emulator config.

---

## Task 1: Project scaffold + tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitignore`
- Create: `app/layout.tsx`, `app/globals.css`, `app/(app)/dashboard/page.tsx`
- Test: `lib/model/__smoke__.test.ts` (temporary — proves the test runner works)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a running Next.js dev server and a working `pnpm test` command for all later tasks.

- [ ] **Step 1: Scaffold the app**

Run:
```bash
cd /Users/user/Downloads/buckets
pnpm create next-app@latest . --typescript --app --tailwind --eslint --src-dir=false --import-alias "@/*" --use-pnpm --no-turbopack
```
When prompted to overwrite the non-empty directory, accept (the only files present are `.gitignore` and `.remember/`, which are safe).

- [ ] **Step 2: Add test tooling**

Run:
```bash
pnpm add -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true, setupFiles: ["./vitest.setup.ts"] },
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
});
```

Create `vitest.setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 4: Write a smoke test**

`lib/model/__smoke__.test.ts`:
```ts
import { describe, it, expect } from "vitest";
describe("test runner", () => {
  it("runs", () => { expect(1 + 1).toBe(2); });
});
```

- [ ] **Step 5: Run it**

Run: `pnpm test`
Expected: PASS, 1 test.

- [ ] **Step 6: Verify dev server boots**

Run: `pnpm dev` then open `http://localhost:3000`. Expected: default page renders. Stop the server.

- [ ] **Step 7: Commit**

```bash
git init && git add -A && git commit -m "chore: scaffold Next.js PWA + vitest"
```
(This is a greenfield dir with no repo yet; `git init` is correct here.)

---

## Task 2: Design tokens + Tailwind theme

**Files:**
- Modify: `app/globals.css`
- Create: `lib/theme.ts`
- Test: `lib/theme.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `BUCKET_DOT_COLORS: string[]` and `pickDotColor(index: number): string` — the palette later bucket UI uses for accent dots.

- [ ] **Step 1: Write the failing test**

`lib/theme.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { BUCKET_DOT_COLORS, pickDotColor } from "@/lib/theme";

describe("pickDotColor", () => {
  it("returns a palette color for an index", () => {
    expect(pickDotColor(0)).toBe(BUCKET_DOT_COLORS[0]);
  });
  it("wraps around when index exceeds palette length", () => {
    expect(pickDotColor(BUCKET_DOT_COLORS.length)).toBe(BUCKET_DOT_COLORS[0]);
  });
  it("has at least 6 distinct colors", () => {
    expect(new Set(BUCKET_DOT_COLORS).size).toBeGreaterThanOrEqual(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/theme.test.ts`
Expected: FAIL — cannot resolve `@/lib/theme`.

- [ ] **Step 3: Implement `lib/theme.ts`**

```ts
export const BUCKET_DOT_COLORS = [
  "#9945FF", "#14F195", "#4DA3FF", "#FF8A3D", "#B8BdC7", "#FF5E57", "#F5C518", "#7C5CFF",
] as const;

export function pickDotColor(index: number): string {
  return BUCKET_DOT_COLORS[index % BUCKET_DOT_COLORS.length];
}
```

- [ ] **Step 4: Add token CSS variables**

In `app/globals.css`, after the Tailwind import, add:
```css
:root {
  --color-base: #0E0F13;
  --color-card: #1A1C22;
  --color-border: #2A2D35;
  --color-text: #E8EAED;
  --color-muted: #8A8F98;
  --grad-brand: linear-gradient(90deg, #9945FF, #14F195);
  --grad-danger: linear-gradient(90deg, #FF8A3D, #FF5E57);
}
html, body { background: var(--color-base); color: var(--color-text); color-scheme: dark; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test lib/theme.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: dark design tokens + bucket dot palette"
```

---

## Task 3: Money helpers

**Files:**
- Create: `lib/model/money.ts`
- Test: `lib/model/money.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Cents = number` (integer minor units)
  - `formatEuros(cents: Cents): string` → e.g. `12345` → `"€123.45"`
  - `toCents(euros: number): Cents` → `123.45` → `12345` (rounds to nearest cent)

- [ ] **Step 1: Write the failing test**

`lib/model/money.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formatEuros, toCents } from "@/lib/model/money";

describe("formatEuros", () => {
  it("formats whole euros", () => { expect(formatEuros(120000)).toBe("€1,200.00"); });
  it("formats cents", () => { expect(formatEuros(4280)).toBe("€42.80"); });
  it("formats zero", () => { expect(formatEuros(0)).toBe("€0.00"); });
});

describe("toCents", () => {
  it("converts euros to integer cents", () => { expect(toCents(123.45)).toBe(12345); });
  it("rounds to nearest cent", () => { expect(toCents(0.005)).toBe(1); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/model/money.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/model/money.ts`**

```ts
export type Cents = number;

const fmt = new Intl.NumberFormat("en-IE", {
  style: "currency", currency: "EUR", currencyDisplay: "narrowSymbol",
});

export function formatEuros(cents: Cents): string {
  return fmt.format(cents / 100);
}

export function toCents(euros: number): Cents {
  return Math.round(euros * 100);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/model/money.test.ts`
Expected: PASS. If the euro symbol differs by ICU version, adjust the expected strings to match `fmt.format` output — the point is integer-cent correctness, not the exact glyph.

- [ ] **Step 5: Delete the temporary smoke test**

```bash
rm lib/model/__smoke__.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: money helpers (integer cents)"
```

---

## Task 4: Domain types + Firestore path helpers

**Files:**
- Create: `lib/model/types.ts`, `lib/model/paths.ts`
- Test: `lib/model/paths.test.ts`

**Interfaces:**
- Consumes: `Cents` from `lib/model/money.ts`.
- Produces (the data model every later subsystem imports):
  - `BucketType = "virtual" | "onchain"` (only `"virtual"` used in MVP; `"onchain"` reserved for the deferred Solana savings bucket).
  - `Bucket = { id: string; name: string; colorIndex: number; percent: number; type: BucketType; remaining: Cents; allocated: Cents }`
  - `Transaction = { id: string; amount: Cents; description: string; bookedAt: string; bucketId: string | null; isIncome: boolean }`
  - `Allocation = { id: string; bucketId: string; amount: Cents; incomeTxId: string; createdAt: string }`
  - `Consent = { id: string; provider: string; status: "active" | "expired"; expiresAt: string }`
  - `UserProfile = { id: string; email: string; premium: boolean; autoApplySplit: boolean }`
  - Path helpers: `userDoc(uid)`, `bucketsCol(uid)`, `txCol(uid)`, `allocationsCol(uid)`, `consentsCol(uid)` — each returns the exact Firestore path string.

- [ ] **Step 1: Write the failing test**

`lib/model/paths.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { userDoc, bucketsCol, txCol, allocationsCol, consentsCol } from "@/lib/model/paths";

describe("firestore paths", () => {
  it("scopes buckets under the user", () => {
    expect(bucketsCol("u1")).toBe("users/u1/buckets");
  });
  it("builds every collection path", () => {
    expect(userDoc("u1")).toBe("users/u1");
    expect(txCol("u1")).toBe("users/u1/transactions");
    expect(allocationsCol("u1")).toBe("users/u1/allocations");
    expect(consentsCol("u1")).toBe("users/u1/consents");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/model/paths.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/model/types.ts`**

```ts
import type { Cents } from "./money";

export type BucketType = "virtual" | "onchain";

export interface Bucket {
  id: string;
  name: string;
  colorIndex: number;
  percent: number;       // 0-100; all buckets for a user sum to 100
  type: BucketType;      // "virtual" in MVP
  remaining: Cents;
  allocated: Cents;
}

export interface Transaction {
  id: string;
  amount: Cents;         // positive = money in, negative = money out
  description: string;
  bookedAt: string;      // ISO date
  bucketId: string | null;
  isIncome: boolean;
}

export interface Allocation {
  id: string;
  bucketId: string;
  amount: Cents;
  incomeTxId: string;
  createdAt: string;
}

export interface Consent {
  id: string;
  provider: string;      // e.g. "gocardless"
  status: "active" | "expired";
  expiresAt: string;     // ISO date — PSD2 ~90 day expiry
}

export interface UserProfile {
  id: string;
  email: string;
  premium: boolean;
  autoApplySplit: boolean;
}
```

- [ ] **Step 4: Implement `lib/model/paths.ts`**

```ts
export const userDoc = (uid: string) => `users/${uid}`;
export const bucketsCol = (uid: string) => `users/${uid}/buckets`;
export const txCol = (uid: string) => `users/${uid}/transactions`;
export const allocationsCol = (uid: string) => `users/${uid}/allocations`;
export const consentsCol = (uid: string) => `users/${uid}/consents`;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test lib/model/paths.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: domain types + firestore path helpers"
```

---

## Task 5: Firebase project + Firestore rules + emulator

**Files:**
- Create: `lib/firebase/client.ts`
- Create: `firestore.rules`, `firebase.json`, `.firebaserc`
- Create: `.env.local.example`
- Test: `firestore.rules` verified via the emulator (manual command below)

**Interfaces:**
- Consumes: nothing at build time.
- Produces: `getFirebaseApp()`, `getAuthClient()`, `getDb()` from `lib/firebase/client.ts` for later tasks; a rules file enforcing per-user isolation.

- [ ] **Step 1: Install Firebase + tools**

```bash
pnpm add firebase
pnpm add -D firebase-tools
```

- [ ] **Step 2: Create a Firebase project (manual, EU region)**

In the Firebase console: create project → create a **Firestore database in an EU region** (`eur3` multi-region or `europe-west1`) → enable **Authentication** with Email/Password + Google providers → copy the web app config. Record these as the `NEXT_PUBLIC_FIREBASE_*` values.

If you need to run this yourself interactively, type in the session prompt:
`! pnpm dlx firebase login`

- [ ] **Step 3: Create `.env.local.example`**

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```
Copy to `.env.local` and fill with real values. `.env.local` is already gitignored by the Next.js scaffold.

- [ ] **Step 4: Implement `lib/firebase/client.ts`**

```ts
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(config);
}
export function getAuthClient(): Auth { return getAuth(getFirebaseApp()); }
export function getDb(): Firestore { return getFirestore(getFirebaseApp()); }
```

- [ ] **Step 5: Write `firestore.rules`**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
      match /{sub=**} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
  }
}
```

- [ ] **Step 6: Write `firebase.json` + `.firebaserc`**

`firebase.json`:
```json
{
  "firestore": { "rules": "firestore.rules" },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "ui": { "enabled": true }
  }
}
```
`.firebaserc`:
```json
{ "projects": { "default": "YOUR_PROJECT_ID" } }
```

- [ ] **Step 7: Verify rules load in the emulator**

Run: `pnpm dlx firebase emulators:start --only firestore,auth`
Expected: emulators boot, rules compile with no errors, UI available at the printed URL. Stop with Ctrl-C.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: firebase client + per-user firestore rules + emulator config"
```

---

## Task 6: Auth provider + sign-in screen

**Files:**
- Create: `lib/auth/AuthProvider.tsx`
- Create: `app/(auth)/sign-in/page.tsx`
- Test: `lib/auth/AuthProvider.test.tsx`

**Interfaces:**
- Consumes: `getAuthClient` from `lib/firebase/client.ts`.
- Produces: `<AuthProvider>` wrapper and `useAuth(): { user: { uid: string; email: string | null } | null; loading: boolean }` for the app shell.

- [ ] **Step 1: Write the failing test**

`lib/auth/AuthProvider.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/lib/auth/AuthProvider";

vi.mock("@/lib/firebase/client", () => ({
  getAuthClient: () => ({
    onAuthStateChanged: (cb: (u: unknown) => void) => {
      cb({ uid: "u1", email: "a@b.com" });
      return () => {};
    },
  }),
}));

function Probe() {
  const { user, loading } = useAuth();
  return <div>{loading ? "loading" : user?.email ?? "anon"}</div>;
}

describe("AuthProvider", () => {
  it("exposes the signed-in user", async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText("a@b.com")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/auth/AuthProvider.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/auth/AuthProvider.tsx`**

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/auth/AuthProvider.test.tsx`
Expected: PASS.

- [ ] **Step 5: Build the sign-in screen**

`app/(auth)/sign-in/page.tsx`:
```tsx
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
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: auth provider + email sign-in screen"
```

---

## Task 7: App shell with bottom tab bar + placeholder screens

**Files:**
- Create: `components/nav/BottomTabBar.tsx`
- Create: `app/(app)/layout.tsx`
- Create: `app/(app)/dashboard/page.tsx`, `app/(app)/buckets/page.tsx`, `app/(app)/coach/page.tsx`, `app/(app)/settings/page.tsx`
- Modify: `app/layout.tsx` (wrap in `AuthProvider`)
- Test: `components/nav/BottomTabBar.test.tsx`

**Interfaces:**
- Consumes: `useAuth` from `lib/auth/AuthProvider.tsx`.
- Produces: the authenticated shell that later subsystems drop screens into.

- [ ] **Step 1: Write the failing test**

`components/nav/BottomTabBar.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BottomTabBar } from "@/components/nav/BottomTabBar";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

describe("BottomTabBar", () => {
  it("renders all four tabs", () => {
    render(<BottomTabBar />);
    for (const label of ["Dashboard", "Buckets", "Coach", "Settings"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
  it("marks the active tab via aria-current", () => {
    render(<BottomTabBar />);
    expect(screen.getByText("Dashboard").closest("a")).toHaveAttribute("aria-current", "page");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/nav/BottomTabBar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/nav/BottomTabBar.tsx`**

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/buckets", label: "Buckets" },
  { href: "/coach", label: "Coach" },
  { href: "/settings", label: "Settings" },
];

export function BottomTabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 flex justify-around py-2"
      style={{ background: "var(--color-card)", borderTop: "1px solid var(--color-border)" }}>
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
            className="text-xs px-3 py-1"
            style={{ color: active ? "var(--color-text)" : "var(--color-muted)", fontWeight: active ? 700 : 400 }}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Implement the authenticated layout**

`app/(app)/layout.tsx`:
```tsx
"use client";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { BottomTabBar } from "@/components/nav/BottomTabBar";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!loading && !user) router.replace("/sign-in"); }, [loading, user, router]);
  if (loading || !user) return <div className="p-6" style={{ color: "var(--color-muted)" }}>Loading…</div>;
  return (
    <div className="min-h-screen pb-16">
      <div className="max-w-md mx-auto p-4">{children}</div>
      <BottomTabBar />
    </div>
  );
}
```

- [ ] **Step 5: Create the four placeholder screens**

Each of `app/(app)/dashboard/page.tsx`, `buckets/page.tsx`, `coach/page.tsx`, `settings/page.tsx`:
```tsx
export default function Page() {
  return <h1 className="text-2xl font-bold">Dashboard</h1>; // change title per screen
}
```
Use titles "Dashboard", "Buckets", "Coach", "Settings" respectively.

- [ ] **Step 6: Wrap the root layout in AuthProvider**

In `app/layout.tsx`, import `AuthProvider` and wrap `{children}` with `<AuthProvider>…</AuthProvider>`. Add the manifest link in `<head>`: `<link rel="manifest" href="/manifest.webmanifest" />`.

- [ ] **Step 7: Run tests + boot the app**

Run: `pnpm test components/nav/BottomTabBar.test.tsx` → Expected: PASS, 2 tests.
Run: `pnpm dev`, sign up, and confirm you land on `/dashboard` with the tab bar. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: authed app shell + bottom tab nav + placeholder screens"
```

---

## Task 8: PWA manifest

**Files:**
- Create: `public/manifest.webmanifest`
- Test: `public/manifest.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: an installable PWA manifest linked from the root layout (Task 7, Step 6).

- [ ] **Step 1: Write the failing test**

`public/manifest.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("PWA manifest", () => {
  it("declares name, standalone display, and theme color", () => {
    const m = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
    expect(m.name).toBe("MyBuckets");
    expect(m.display).toBe("standalone");
    expect(m.background_color).toBe("#0E0F13");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test public/manifest.test.ts`
Expected: FAIL — file not found.

- [ ] **Step 3: Create `public/manifest.webmanifest`**

```json
{
  "name": "MyBuckets",
  "short_name": "MyBuckets",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#0E0F13",
  "theme_color": "#0E0F13",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```
Add placeholder `public/icon-192.png` and `public/icon-512.png` (any solid dark square for now; real icons later).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test public/manifest.test.ts`
Expected: PASS.

- [ ] **Step 5: Full test + typecheck sweep**

Run: `pnpm test && pnpm exec tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: PWA manifest"
```

---

## Self-Review

- **Spec coverage:** Foundation = Next.js PWA (Tasks 1, 8) + Firebase Auth/Firestore EU (Tasks 5, 6) + data model with `bucket.type` hook for the deferred Solana bucket (Task 4) + integer-cent money type (Task 3) + dark/no-emoji design tokens + nav shell (Tasks 2, 7). Business logic (SplitEngine, bank, AI, billing) is intentionally out of scope — covered by later plans.
- **Deferred-feature hook present:** `BucketType = "virtual" | "onchain"` in Task 4 satisfies the spec's "cheap MVP hook" so v2 needs no data migration.
- **Type consistency:** `Cents` defined in Task 3 and consumed in Task 4; `useAuth` shape defined in Task 6 and consumed in Task 7; `BottomTabBar` tab set matches the spec's four sections.
- **Placeholders:** none — every code step contains full code.

## Verification (whole plan)

1. `pnpm test` — all unit tests pass (theme, money, paths, auth, nav, manifest).
2. `pnpm exec tsc --noEmit` — no type errors.
3. `pnpm dev` — sign up → land on `/dashboard`; tab bar switches between the four screens; unauthenticated visit to `/dashboard` redirects to `/sign-in`.
4. `firebase emulators:start` — Firestore rules compile; a user can only read/write `users/{their-uid}/**`.
