import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useBuckets } from "@/lib/data/useBuckets";

vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "u1", email: null }, loading: false }) }));
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  onSnapshot: (_q: unknown, cb: (snap: unknown) => void) => {
    cb({ docs: [{ id: "a", data: () => ({ name: "Rent", colorIndex: 0, percent: 100, type: "virtual", remaining: 500, allocated: 500 }) }] });
    return () => {};
  },
}));
vi.mock("@/lib/firebase/client", () => ({ getDb: () => ({}) }));

function Probe() {
  const { buckets, loading } = useBuckets();
  return <div>{loading ? "loading" : buckets.map((b) => b.name).join(",")}</div>;
}

describe("useBuckets", () => {
  it("exposes the user's buckets from a snapshot", async () => {
    render(<Probe />);
    await waitFor(() => expect(screen.getByText("Rent")).toBeInTheDocument());
  });
});
