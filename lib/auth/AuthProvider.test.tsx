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
