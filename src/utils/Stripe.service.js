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
 * @param {string} paymentIntentId - The ID of the Payment Intent to capture.
 * @param {number} [amountToCapture] - (Optional) The partial amount (in USD) to capture. If omitted, captures the full amount.
 * @param {number} [applicationFeeAmount] - (Optional) The amount (in USD) to take as a platform fee.
 */
export const capturePaymentIntent = async (
  paymentIntentId,
  amountToCapture,
  applicationFeeAmount // <-- ADDED THIS PARAMETER
) => {
  const captureOptions = {};

  if (amountToCapture) {
    captureOptions.amount_to_capture = Math.round(amountToCapture * 100);
  }
  // --- THIS IS THE NEW LOGIC ---
  if (applicationFeeAmount) {
    // This tells Stripe how much of the captured amount to keep as a platform fee
    captureOptions.application_fee_amount = Math.round(
      applicationFeeAmount * 100
    );
  }
  // --- END NEW LOGIC ---

  try {
    const capturedIntent = await stripe.paymentIntents.capture(
      paymentIntentId,
      captureOptions // Pass the updated options
    );
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
  destinationAccountId
) => {
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
