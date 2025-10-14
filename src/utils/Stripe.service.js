import dotenv from "dotenv";
dotenv.config();

import Stripe from "stripe";

// Check for Stripe credentials. If they are not set, log a warning and use a mock key.
if (!process.env.STRIPE_SECRET_KEY) {
  console.warn(
    "Stripe secret key is not set in the .env file. Using a mock key. Payment-related features will not work in a live environment."
  );
}

export const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY || "mock_stripe_key"
);

/**
 * NEW: Creates a Payment Intent for pre-authorization.
 * @param {number} amount - The amount to authorize, in dollars.
 * @param {string} destinationStripeAccountId - The Stripe Connect account ID of the tutor.
 */
export const createPaymentIntent = async (
  amount,
  destinationStripeAccountId
) => {
  const amountInCents = Math.round(amount * 100);

  // This fee should be calculated based on your platform's commission rate.
  // For now, let's assume a 20% platform fee.
  const applicationFeeAmount = Math.round(amountInCents * 0.2);

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "usd",
      capture_method: "manual", // This is key: it only authorizes the funds.
      application_fee_amount: applicationFeeAmount,
      transfer_data: {
        destination: destinationStripeAccountId,
      },
    });
    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  } catch (error) {
    console.error("Error creating Payment Intent for authorization:", error);
    throw error;
  }
};

/**
 * @desc Captures a previously authorized Payment Intent. This finalizes the charge.
 * @param {string} paymentIntentId - The ID of the Payment Intent to capture (pi_...).
 */
export const capturePaymentIntent = async (paymentIntentId) => {
  try {
    const capturedIntent = await stripe.paymentIntents.capture(paymentIntentId);
    return capturedIntent;
  } catch (error) {
    console.error(`Error capturing Payment Intent ${paymentIntentId}:`, error);
    throw error;
  }
};

/**
 * @desc Cancels (releases) a previously authorized Payment Intent. This voids the hold on the funds.
 * @param {string} paymentIntentId - The ID of the Payment Intent to cancel.
 */
export const releasePaymentIntent = async (paymentIntentId) => {
  try {
    const cancelledIntent = await stripe.paymentIntents.cancel(paymentIntentId);
    return cancelledIntent;
  } catch (error) {
    console.error(
      `Error releasing/cancelling Payment Intent ${paymentIntentId}:`,
      error
    );
    throw error;
  }
};

/**
 * @desc A function to handle payouts for tutors/location owners (separate from session payment)
 */
export const createPayout = async (
  amount,
  currency = "usd",
  destinationAccountId
) => {
  try {
    const payout = await stripe.payouts.create({
      amount: Math.round(amount * 100), // Stripe expects amount in cents
      currency,
      destination: destinationAccountId, // The connected account to pay out to
    });
    return payout;
  } catch (error) {
    console.error("Error creating payout:", error);
    throw error;
  }
};
