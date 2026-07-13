import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { usePremium } from "./usePremium";

// CRITICAL: stable module-level object to prevent infinite resubscribe (OOM)
const mockAuth = { user: { uid: "u1", email: null }, loading: false };

vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("firebase/firestore", () => ({
  doc: () => ({}),
  onSnapshot: (_r: unknown, cb: (s: unknown) => void) => {
    cb({ data: () => ({ premium: true }) });
    return () => {};
  },
}));

vi.mock("@/lib/firebase/client", () => ({
  getDb: () => ({}),
}));

function Probe() {
  const { premium, loading } = usePremium();
  if (loading) return <div>loading</div>;
  return <div>{premium ? "pro" : "free"}</div>;
}

describe("usePremium", () => {
  it("should subscribe to user doc and read premium flag", () => {
    render(<Probe />);
    expect(screen.getByText("pro")).toBeInTheDocument();
  });
});
