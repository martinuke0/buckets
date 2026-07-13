/**
 * Initiates Stripe checkout flow for the current user.
 * Posts to /api/billing/checkout and redirects to the returned Stripe URL.
 * Single source for all upgrade flows (buckets upsell, Coach paywall, etc).
 */
export async function startCheckout(uid: string): Promise<void> {
  try {
    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid }),
    });

    if (!response.ok) {
      console.error("Checkout creation failed:", response.status);
      return;
    }

    const { url } = await response.json();
    if (url) {
      window.location.href = url;
    } else {
      console.error("Checkout response missing url");
    }
  } catch (error) {
    console.error("Checkout error:", error);
  }
}
