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
