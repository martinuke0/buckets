import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// Stable module-level mocks (OOM guard)
vi.mock("@/lib/observability/reportProblem", () => ({
  reportProblem: vi.fn().mockResolvedValue(undefined),
}));

const mockUseAuth = {
  user: { uid: "test-uid", email: "test@example.com" },
  loading: false,
};
vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => mockUseAuth,
}));

import { ReportProblem } from "./ReportProblem";
import { reportProblem } from "@/lib/observability/reportProblem";

describe("ReportProblem", () => {
  beforeEach(() => {
    vi.mocked(reportProblem).mockClear();
  });

  it("renders a 'Report a problem' button", () => {
    render(<ReportProblem summary="Test action failed" />);
    expect(screen.getByText("Report a problem")).toBeInTheDocument();
  });

  it("opens dialog when button is clicked", async () => {
    render(<ReportProblem summary="Test action failed" />);

    const button = screen.getByText("Report a problem");
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText("Report a Problem")).toBeInTheDocument();
    });
  });

  it("calls reportProblem with summary, error, and note when submitted", async () => {
    render(<ReportProblem summary="Sync failed" error="Internal error" />);

    // Open dialog
    fireEvent.click(screen.getByText("Report a problem"));

    // Type a note
    const textarea = await screen.findByPlaceholderText(/optional/i);
    fireEvent.change(textarea, { target: { value: "This happened after clicking refresh" } });

    // Submit
    fireEvent.click(screen.getByText("Submit"));

    // Assert reportProblem was called with correct params
    await waitFor(() => {
      expect(reportProblem).toHaveBeenCalledWith("test-uid", {
        summary: "Sync failed",
        error: "Internal error",
        note: "This happened after clicking refresh",
      });
    });
  });

  it("shows confirmation after successful submission", async () => {
    render(<ReportProblem summary="Test action failed" />);

    // Open dialog
    fireEvent.click(screen.getByText("Report a problem"));

    // Submit without note
    await waitFor(() => {
      fireEvent.click(screen.getByText("Submit"));
    });

    // Confirmation should appear
    await waitFor(() => {
      expect(screen.getByText(/reported/i)).toBeInTheDocument();
    });
  });

  it("calls reportProblem without note when none provided", async () => {
    render(<ReportProblem summary="Test failed" error="Some error" />);

    // Open dialog
    fireEvent.click(screen.getByText("Report a problem"));

    // Submit without typing a note
    await waitFor(() => {
      fireEvent.click(screen.getByText("Submit"));
    });

    await waitFor(() => {
      expect(reportProblem).toHaveBeenCalledWith("test-uid", {
        summary: "Test failed",
        error: "Some error",
        note: "",
      });
    });
  });

  it("closes dialog when Cancel is clicked", async () => {
    render(<ReportProblem summary="Test failed" />);

    // Open dialog
    fireEvent.click(screen.getByText("Report a problem"));

    await waitFor(() => {
      expect(screen.getByText("Report a Problem")).toBeInTheDocument();
    });

    // Click Cancel
    fireEvent.click(screen.getByText("Cancel"));

    // Dialog should be closed
    await waitFor(() => {
      expect(screen.queryByText("Report a Problem")).not.toBeInTheDocument();
    });
  });
});
