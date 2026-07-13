import type Stripe from "stripe";

/**
 * Pure webhook event handler that delegates to an injected setPremium function.
 * This design allows testing without Firestore.
 */
export async function handleStripeEvent(
  event: Stripe.Event,
  setPremium: (uid: string, value: boolean) => Promise<void>,
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const uid = session.client_reference_id;
      if (uid) {
        await setPremium(uid, true);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const uid = subscription.metadata?.uid;
      if (uid) {
        await setPremium(uid, false);
      }
      break;
    }

    default:
      // No-op for other event types
      break;
  }
}
