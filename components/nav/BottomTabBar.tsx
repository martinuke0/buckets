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
