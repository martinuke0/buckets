import { ReactNode } from "react";
import { Logo } from "@/components/ui/primitives";

interface AppShellProps {
  children: ReactNode;
  rightSlot?: ReactNode;
}

export function AppShell({ children, rightSlot }: AppShellProps) {
  return (
    <div className="min-h-screen pb-24">
      {/* Brand Top Bar */}
      <header
        className="flex items-center justify-between px-4 py-3 mb-4"
        style={{
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-center gap-3">
          <Logo size={32} />
          <h1
            className="text-xl font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            MyBuckets
          </h1>
        </div>
        {rightSlot && <div>{rightSlot}</div>}
      </header>

      {/* Content Column */}
      <div className="max-w-md mx-auto px-4">
        {children}
      </div>
    </div>
  );
}
