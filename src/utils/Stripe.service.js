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
  const applicationFeeAmount = Math.round(amountInCents * 0.2); // Assuming 20% platform fee

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "usd",
      capture_method: "manual",
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
    console.error("Error creating Payment Intent:", error);
    throw error;
  }
};

/**
 * @description Confirms a Payment Intent with a test payment method.
 */
export const confirmPaymentIntent = async (paymentIntentId) => {
  try {
    const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/success", // Added a dummy return_url
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
 * @description (DEPRECATED FOR THIS FLOW) Creates a Payout from the Platform's balance.
 */
export const createPayout = async (
  amount,
  currency = "usd",
  destinationAccountId // This is actually a bank account ID for payouts
) => {
  // This function is incorrect for our Connect workflow.
  // It's left here to show the difference.
  try {
    const payout = await stripe.payouts.create({
      amount: Math.round(amount * 100),
      currency,
      destination: destinationAccountId,
    });
    return payout;
  } catch (error) {
    console.error("Error creating payout:", error);
    throw error;
  }
};

/**
 * @description (NEW & CORRECT) Creates a Transfer from a Connected Account's balance to their bank.
 */
export const createTransfer = async (
  amount,
  currency = "usd",
  destinationStripeAccountId
) => {
  try {
    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100),
      currency,
      destination: destinationStripeAccountId,
    });
    return transfer;
  } catch (error) {
    console.error("Error creating transfer:", error);
    throw error;
  }
};
