"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, BucketsIcon, CoachIcon, SettingsIcon, SyncIcon, type IconProps } from "./icons";
import type { ComponentType } from "react";

const TABS = [
  { href: "/dashboard", label: "Home", Icon: HomeIcon },
  { href: "/buckets", label: "Buckets", Icon: BucketsIcon },
  { href: "/coach", label: "Coach", Icon: CoachIcon },
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
];

interface BottomTabBarProps {
  onSync?: () => void;
}

export function BottomTabBar({ onSync }: BottomTabBarProps) {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-4 inset-x-0 flex justify-center px-4"
      style={{ zIndex: 50 }}
    >
      <div
        className="flex items-end gap-1 px-6 py-3 rounded-full"
        style={{
          background: "rgba(20, 22, 28, 0.82)",
          backdropFilter: "blur(14px)",
          border: "1px solid var(--color-border)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
          maxWidth: "420px",
        }}
      >
        {/* Home */}
        <NavLink href={TABS[0].href} label={TABS[0].label} Icon={TABS[0].Icon} active={pathname === TABS[0].href} />

        {/* Buckets */}
        <NavLink href={TABS[1].href} label={TABS[1].label} Icon={TABS[1].Icon} active={pathname === TABS[1].href} />

        {/* Raised Sync Button */}
        <button
          onClick={onSync}
          className="flex flex-col items-center gap-1 px-4 py-2 transition-transform hover:scale-105"
          style={{
            background: "var(--grad-brand)",
            borderRadius: "50%",
            marginTop: "-24px",
            width: "56px",
            height: "56px",
            border: "2px solid rgba(20, 22, 28, 0.82)",
            boxShadow: "0 4px 16px rgba(153, 69, 255, 0.4)",
          }}
          aria-label="Sync"
        >
          <SyncIcon className="w-5 h-5" color="white" />
          <span className="text-[10px] font-medium" style={{ color: "white" }}>
            Sync
          </span>
        </button>

        {/* Coach */}
        <NavLink href={TABS[2].href} label={TABS[2].label} Icon={TABS[2].Icon} active={pathname === TABS[2].href} />

        {/* Settings */}
        <NavLink href={TABS[3].href} label={TABS[3].label} Icon={TABS[3].Icon} active={pathname === TABS[3].href} />
      </div>
    </nav>
  );
}

function NavLink({ href, label, Icon, active }: { href: string; label: string; Icon: ComponentType<IconProps>; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="flex flex-col items-center gap-1 px-4 py-2 transition-colors relative"
    >
      <Icon
        className="w-5 h-5"
        color={active ? "var(--color-success)" : "var(--color-muted)"}
      />
      <span
        className="text-[10px] font-medium"
        style={{ color: active ? "var(--color-success)" : "var(--color-muted)" }}
      >
        {label}
      </span>
      {active && (
        <div
          className="absolute bottom-0 left-1/2 w-8 rounded-full"
          style={{
            height: "3px",
            transform: "translateX(-50%)",
            background: "var(--grad-brand)",
            boxShadow: "0 0 8px rgba(153, 69, 255, 0.6), 0 0 12px rgba(20, 241, 149, 0.4)",
          }}
        />
      )}
    </Link>
  );
}
