"use client";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { AppShell } from "@/components/ui/AppShell";
import { BottomTabBar } from "@/components/nav/BottomTabBar";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!loading && !user) router.replace("/sign-in"); }, [loading, user, router]);
  if (loading || !user) return <div className="p-6" style={{ color: "var(--color-muted)" }}>Loading…</div>;
  return (
    <>
      <AppShell>{children}</AppShell>
      <BottomTabBar />
    </>
  );
}
