import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-06-24.dahlia",
});

interface CheckoutRequestBody {
  uid: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { uid }: CheckoutRequestBody = await req.json();

    if (!uid) {
      return NextResponse.json({ error: "Missing uid" }, { status: 400 });
    }

    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) {
      return NextResponse.json(
        { error: "STRIPE_PRICE_ID not configured" },
        { status: 500 },
      );
    }

    // Determine base URL for success/cancel URLs
    const origin =
      process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
    const successUrl = `${origin}/billing/success`;
    const cancelUrl = `${origin}/billing/cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      client_reference_id: uid,
      subscription_data: {
        metadata: {
          uid,
        },
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Checkout session creation failed: ${errorMessage}` },
      { status: 500 },
    );
  }
}
