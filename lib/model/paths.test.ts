import { describe, it, expect } from "vitest";
import {
  userDoc,
  bucketsCol,
  txCol,
  allocationsCol,
  consentsCol,
  coachConversationsCol,
  coachMessagesCol,
  coachMemoriesCol,
} from "@/lib/model/paths";

describe("firestore paths", () => {
  it("scopes buckets under the user", () => {
    expect(bucketsCol("u1")).toBe("users/u1/buckets");
  });
  it("builds every collection path", () => {
    expect(userDoc("u1")).toBe("users/u1");
    expect(txCol("u1")).toBe("users/u1/transactions");
    expect(allocationsCol("u1")).toBe("users/u1/allocations");
    expect(consentsCol("u1")).toBe("users/u1/consents");
  });
});

describe("coach paths", () => {
  it("builds owner-scoped coach collection paths", () => {
    expect(coachConversationsCol("u1")).toBe("users/u1/conversations");
    expect(coachMessagesCol("u1", "c1")).toBe("users/u1/conversations/c1/messages");
    expect(coachMemoriesCol("u1")).toBe("users/u1/coachMemories");
  });
});
