import { describe, it, expect, vi, beforeEach } from "vitest";
import Stripe from "stripe";

// Set env vars before importing the route
process.env.STRIPE_SECRET_KEY = "sk_test_123";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";

// Mock adminSetPremium at module level
const mockAdminSetPremium = vi.fn();
vi.mock("@/lib/server/firebaseAdmin", () => ({
  adminSetPremium: mockAdminSetPremium,
}));

// Import route after mocks are set
const { POST } = await import("./route");

describe("POST /api/billing/webhook", () => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-06-24.dahlia",
  });

  beforeEach(() => {
    mockAdminSetPremium.mockClear();
    mockAdminSetPremium.mockResolvedValue(undefined);
  });

  it("verifies signature and handles checkout.session.completed", async () => {
    const uid = "user123";
    const payload = JSON.stringify({
      id: "evt_test",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test",
          object: "checkout.session",
          client_reference_id: uid,
        },
      },
    });

    // Generate valid signature
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    });

    const request = new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      body: payload,
      headers: {
        "stripe-signature": signature,
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ received: true });
    expect(mockAdminSetPremium).toHaveBeenCalledWith(uid, true);
  });

  it("returns 400 for invalid signature", async () => {
    const payload = JSON.stringify({
      id: "evt_test",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test",
          object: "checkout.session",
          client_reference_id: "user123",
        },
      },
    });

    const request = new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      body: payload,
      headers: {
        "stripe-signature": "invalid_signature",
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mockAdminSetPremium).not.toHaveBeenCalled();
  });

  it("returns 400 for missing signature", async () => {
    const payload = JSON.stringify({
      id: "evt_test",
      object: "event",
      type: "checkout.session.completed",
    });

    const request = new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      body: payload,
      headers: {},
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mockAdminSetPremium).not.toHaveBeenCalled();
  });
});
