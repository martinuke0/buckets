import { collection, addDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { getBreadcrumbs } from "@/lib/observability/breadcrumbs";

export interface ProblemReportInput {
  summary: string;
  error?: string;
  note?: string;
}

export async function reportProblem(
  uid: string,
  input: ProblemReportInput
): Promise<void> {
  const { summary, error, note } = input;

  // Guard for non-browser environment
  const path =
    typeof window !== "undefined" ? window.location.pathname : "";
  const userAgent =
    typeof window !== "undefined" ? window.navigator.userAgent : "";

  // Build the doc, omitting undefined fields
  const doc: Record<string, unknown> = {
    summary,
    breadcrumbs: getBreadcrumbs(),
    createdAt: new Date().toISOString(),
    path,
    userAgent,
  };

  if (error !== undefined && error !== "") {
    doc.error = error;
  }

  if (note !== undefined && note.trim() !== "") {
    doc.note = note;
  }

  const db = getDb();
  const problemReportsCollection = collection(
    db,
    `users/${uid}/problemReports`
  );
  await addDoc(problemReportsCollection, doc);
}
