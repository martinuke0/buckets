import { describe, it, expect, vi } from "vitest";

const deleteDocFn = vi.fn().mockResolvedValue(undefined);

vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  doc: () => ({}),
  deleteDoc: (...a: unknown[]) => deleteDocFn(...a),
  onSnapshot: () => () => {},
}));

vi.mock("@/lib/firebase/client", () => ({
  getDb: () => ({}),
}));

import { deleteCoachMemory } from "@/lib/data/coachMemories";

describe("coachMemories", () => {
  it("deleteCoachMemory calls deleteDoc", async () => {
    await deleteCoachMemory("u1", "m1");
    expect(deleteDocFn).toHaveBeenCalled();
  });
});
