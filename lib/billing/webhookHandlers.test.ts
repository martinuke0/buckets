import { describe, it, expect, vi } from "vitest";
import { handleStripeEvent } from "@/lib/billing/webhookHandlers";

describe("handleStripeEvent", () => {
  it("sets premium true on checkout.session.completed with client_reference_id", async () => {
    const setPremium = vi.fn().mockResolvedValue(undefined);
    await handleStripeEvent(
      { type: "checkout.session.completed", data: { object: { client_reference_id: "u1" } } } as any,
      setPremium,
    );
    expect(setPremium).toHaveBeenCalledWith("u1", true);
  });
  it("ignores unrelated events", async () => {
    const setPremium = vi.fn();
    await handleStripeEvent({ type: "payment_intent.created", data: { object: {} } } as any, setPremium);
    expect(setPremium).not.toHaveBeenCalled();
  });
});
