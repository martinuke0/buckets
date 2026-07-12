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
    <nav className="fixed bottom-0 inset-x-0"
      style={{ background: "var(--color-card)", borderTop: "1px solid var(--color-border)" }}>
      <div className="max-w-md mx-auto flex justify-around py-2">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
              className="text-xs px-4 py-1 rounded-md transition-colors"
              style={{ color: active ? "var(--color-text)" : "var(--color-muted)", fontWeight: active ? 700 : 400 }}>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
