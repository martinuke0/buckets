import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase/client");
vi.mock("@/lib/observability/breadcrumbs");

import { reportProblem } from "@/lib/observability/reportProblem";
import * as firestore from "firebase/firestore";
import * as client from "@/lib/firebase/client";
import * as breadcrumbs from "@/lib/observability/breadcrumbs";

const mockAddDoc = vi.fn().mockResolvedValue({ id: "r1" });

beforeEach(() => {
  mockAddDoc.mockClear();
  vi.mocked(firestore.addDoc).mockImplementation(mockAddDoc);
  vi.mocked(firestore.collection).mockReturnValue({} as any);
  vi.mocked(client.getDb).mockReturnValue({} as any);
  vi.mocked(breadcrumbs.getBreadcrumbs).mockReturnValue([
    { action: "sync", at: "t" },
  ]);
});

describe("reportProblem", () => {
  it("writes a problem report with breadcrumbs", async () => {
    await reportProblem("u1", { summary: "sync failed", error: "internal" });
    expect(mockAddDoc).toHaveBeenCalled();
    const doc = mockAddDoc.mock.calls[0][1];
    expect(doc.summary).toBe("sync failed");
    expect(doc.error).toBe("internal");
    expect(doc.breadcrumbs).toEqual([{ action: "sync", at: "t" }]);
    expect(typeof doc.createdAt).toBe("string");
  });

  it("omits error when not provided", async () => {
    await reportProblem("u1", { summary: "issue found" });
    const doc = mockAddDoc.mock.calls[0][1];
    expect(doc.summary).toBe("issue found");
    expect("error" in doc).toBe(false);
    expect(doc.breadcrumbs).toEqual([{ action: "sync", at: "t" }]);
  });

  it("includes note when provided", async () => {
    await reportProblem("u1", {
      summary: "sync failed",
      error: "timeout",
      note: "happened during batch import",
    });
    const doc = mockAddDoc.mock.calls[0][1];
    expect(doc.note).toBe("happened during batch import");
  });

  it("includes path and userAgent in the doc", async () => {
    await reportProblem("u1", { summary: "test" });
    const doc = mockAddDoc.mock.calls[0][1];
    expect("path" in doc).toBe(true);
    expect("userAgent" in doc).toBe(true);
  });
});
