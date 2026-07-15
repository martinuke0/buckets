"use client";
import { useState } from "react";
import { reportProblem } from "@/lib/observability/reportProblem";
import { useAuth } from "@/lib/auth/AuthProvider";

export interface ReportProblemProps {
  summary: string;
  error?: string;
}

export function ReportProblem({ summary, error }: ReportProblemProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!user) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      await reportProblem(user.uid, { summary, error, note });
      setShowConfirmation(true);
      setTimeout(() => {
        setIsOpen(false);
        setShowConfirmation(false);
        setNote("");
      }, 2000);
    } catch (err) {
      // Surface it, don't silently swallow — the user just clicked a button.
      console.error("Failed to report problem:", err);
      setSubmitError("Couldn't submit right now. Try again in a moment.");
    } finally {
      setSubmitting(false); // always reset so the button doesn't stick
    }
  };

  const handleCancel = () => {
    setIsOpen(false);
    setNote("");
    setShowConfirmation(false);
    setSubmitError(null);
  };

  if (!user) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        style={{
          background: "none",
          border: "none",
          color: "var(--color-text)",
          cursor: "pointer",
          fontSize: "0.875rem",
          textDecoration: "underline",
          padding: 0,
        }}
      >
        Report a problem
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)", zIndex: 1000 }}
          onClick={handleCancel}
        >
          <div
            className="rounded-2xl p-6 max-w-md w-full mx-4"
            style={{ background: "var(--color-card)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              className="text-xl font-bold mb-4"
              style={{ color: "var(--color-text)" }}
            >
              Report a Problem
            </h2>

            {showConfirmation ? (
              <div
                style={{
                  color: "var(--color-success)",
                  fontSize: "0.875rem",
                  padding: "1rem",
                  textAlign: "center",
                }}
              >
                Thanks — reported
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <p
                    className="text-sm mb-2"
                    style={{ color: "var(--color-muted)" }}
                  >
                    {summary}
                  </p>
                  <label className="block">
                    <span
                      className="text-sm font-semibold mb-2 block"
                      style={{ color: "var(--color-text)" }}
                    >
                      Additional details (optional)
                    </span>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="What were you doing when this happened? (optional)"
                      className="w-full rounded-lg px-4 py-2"
                      style={{
                        background: "var(--color-base)",
                        border: "1px solid var(--color-border)",
                        color: "var(--color-text)",
                        minHeight: "100px",
                        resize: "vertical",
                      }}
                      disabled={submitting}
                    />
                  </label>
                </div>

                {submitError && (
                  <div
                    style={{
                      color: "var(--color-danger)",
                      fontSize: "0.8125rem",
                      marginBottom: "0.75rem",
                    }}
                  >
                    {submitError}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex-1 rounded-lg py-2 px-4 font-semibold"
                    style={{
                      background: submitting
                        ? "var(--color-muted)"
                        : "var(--grad-brand)",
                      color: "var(--color-text)",
                      cursor: submitting ? "not-allowed" : "pointer",
                    }}
                  >
                    {submitting ? "Submitting..." : "Submit"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={submitting}
                    className="rounded-lg py-2 px-4 font-semibold"
                    style={{
                      background: "var(--color-border)",
                      color: "var(--color-text)",
                      cursor: submitting ? "not-allowed" : "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
