import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Page from "./page";

// Stable mock objects (NOT recreated per render to avoid OOM)
const mockBankConnection = {
  connect: vi.fn(),
  refresh: vi.fn(),
  busy: false,
  lastResult: null,
  error: null,
};

const mockAuth = {
  user: { uid: "test-uid", email: "user@example.com" },
  loading: false,
};

vi.mock("@/lib/bank/useBankConnection", () => ({
  useBankConnection: () => mockBankConnection,
}));

vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("@/lib/firebase/client", () => ({
  getAuthClient: vi.fn(() => ({
    signOut: vi.fn(),
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Settings page", () => {
  it("shows security reassurance and no leaked internal strings", () => {
    render(<Page />);

    // Security copy must be present
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    expect(screen.getByText(/bank-grade connection/i)).toBeInTheDocument();

    // NO leaked internal strings — including the infra vendor name
    expect(screen.queryByText(/internal/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/plaid/i)).not.toBeInTheDocument();
  });

  it("renders bank connection section with trust badges", () => {
    render(<Page />);

    expect(screen.getByText(/bank connection/i)).toBeInTheDocument();
    expect(screen.getByText(/256-bit encryption/i)).toBeInTheDocument();
  });

  it("renders account section with email", () => {
    render(<Page />);

    expect(screen.getByText(/account/i)).toBeInTheDocument();
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
  });
});
