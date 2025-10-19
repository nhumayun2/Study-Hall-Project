import dotenv from "dotenv";
dotenv.config();
import Stripe from "stripe";

export const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY || "mock_stripe_key"
);

/**
 * @description Creates a Payment Intent for pre-authorization.
 */
export const createPaymentIntent = async (
  amount,
  destinationStripeAccountId
) => {
  const amountInCents = Math.round(amount * 100);
  // This fee can be fetched from a settings model in a real app
  const applicationFeeAmount = Math.round(amountInCents * 0.2); // Assuming 20% platform fee

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "usd",
      capture_method: "manual", // Authorize now, capture later
      application_fee_amount: applicationFeeAmount,
      transfer_data: {
        destination: destinationStripeAccountId,
      },
      // --- FIX --- Add automatic payment methods to avoid the return_url issue on creation
      automatic_payment_methods: { enabled: true },
    });
    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  } catch (error) {
    console.error("Error creating Payment Intent:", error);
    throw error;
  }
};

/**
 * @description (NEW) Confirms a Payment Intent with a test payment method.
 * This moves the status from 'requires_payment_method' to 'requires_capture'.
 */
export const confirmPaymentIntent = async (paymentIntentId) => {
  try {
    const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: "pm_card_visa", // 'pm_card_visa' is a universal Stripe test card
      // --- THIS IS THE FIX ---
      // Provide a return_url, which is required by newer Stripe API versions
      // for payment methods that could involve redirects.
      return_url: `${process.env.FRONTEND_URL}/payment-success`,
    });
    return paymentIntent;
  } catch (error) {
    console.error("Error confirming Payment Intent:", error);
    throw error;
  }
};

/**
 * @description Captures a previously authorized and confirmed Payment Intent.
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
 * @description Cancels (releases) a previously authorized Payment Intent.
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
 * @description Creates a Payout to a connected account.
 */
export const createPayout = async (
  amount,
  currency = "usd",
  destinationAccountId
) => {
  try {
    const payout = await stripe.payouts.create(
      {
        amount: Math.round(amount * 100),
        currency,
        // Payouts don't use destination, they are direct transfers TO the account
        // The destination parameter is for the 'destination' charge type which is different
      },
      {
        stripeAccount: destinationAccountId, // Payouts must specify the connected account ID in the options
      }
    );
    return payout;
  } catch (error) {
    console.error("Error creating payout:", error);
    throw error;
  }
};
