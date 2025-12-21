import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
// We now import all three Stripe functions
import {
  createPaymentIntent as createStripePaymentIntent,
  confirmPaymentIntent,
  capturePaymentIntent,
} from "../utils/Stripe.service.js";
import { Session } from "../model/session.model.js";
import { User } from "../model/user.model.js";
import { Transaction } from "../model/transaction.model.js";
import { Withdrawal } from "../model/withdrawal.model.js";
import { Settings } from "../model/settings.model.js";

// ====================================================================
// --- PAYMENT FLOW ---
// ====================================================================

/**
 * @description STUDENT pre-authorizes payment (Creates Payment Intent).
 * --- THIS FUNCTION IS NOW UPDATED ---
 * It now requires `numberOfMinors` in the body to calculate the total price.
 */
export const createPaymentIntentForSession = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  // --- NEW: Get `numberOfMinors` from the body ---
  const { numberOfMinors, tutorId } = req.body;

  if (!numberOfMinors || numberOfMinors < 1) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "The number of minors is required."
    );
  }

  const session = await Session.findById(sessionId);
  if (!session) {
    throw new AppError(httpStatus.NOT_FOUND, "Session not found.");
  }

  let pricePerMinor;
  let targetTutorId;

  if (session.type === "Offer") {
    pricePerMinor = session.price;
    targetTutorId = session.creator; // For an Offer, the creator is the tutor
  } else if (session.type === "Request") {
    if (!tutorId) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Tutor ID is required for a 'Request' type session."
      );
    }
    targetTutorId = tutorId;
    const applicant = session.tutorApplicants.find(
      (app) => app.tutorId.toString() === tutorId
    );
    if (!applicant)
      throw new AppError(
        httpStatus.NOT_FOUND,
        "This tutor has not applied to the session."
      );
    pricePerMinor = applicant.offerPrice;
  }

  if (pricePerMinor <= 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This session is free and does not require payment authorization."
    );
  }

  // --- NEW: Calculate final price based on number of minors ---
  const finalPrice = pricePerMinor * numberOfMinors;

  const tutor = await User.findById(targetTutorId).select("+stripeAccountId");
  if (!tutor || !tutor.stripeAccountId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "The selected tutor is not configured to receive payments."
    );
  }

  // --- Pass the correct final price to Stripe ---
  const { clientSecret, paymentIntentId } = await createStripePaymentIntent(
    finalPrice,
    tutor.stripeAccountId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Payment intent created successfully.",
    data: { clientSecret, paymentIntentId, totalAmount: finalPrice }, // Send back the total
  });
});

/**
 * @description (NEW) STUDENT confirms the payment intent with a test card.
 * @route POST /api/v1/financials/confirm-payment
 * @access Student
 */
export const confirmPayment = catchAsync(async (req, res) => {
  const { paymentIntentId } = req.body;

  if (!paymentIntentId) {
    throw new AppError(httpStatus.BAD_REQUEST, "PaymentIntent ID is required.");
  }

  // Call our Stripe service to confirm the payment with the test card
  const paymentIntent = await confirmPaymentIntent(paymentIntentId);

  // After confirmation, the status should be 'requires_capture'
  if (paymentIntent.status === "requires_capture") {
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Payment confirmed and is ready for capture.",
      data: { status: paymentIntent.status, paymentIntentId: paymentIntent.id },
    });
  } else {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Payment could not be confirmed. Status: ${paymentIntent.status}`
    );
  }
});

// ... The rest of the controller functions remain the same ...

/**
 * @description TUTOR/LOCATION OWNER requests a withdrawal.
 */
export const requestWithdrawal = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { amount } = req.body;
  if (!amount || typeof amount !== "number" || amount <= 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "A valid withdrawal amount is required."
    );
  }
  const settings = await Settings.getSettings();
  if (amount < settings.withdrawalLimits.min) {
    // Updated to match settings model
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Minimum withdrawal amount is $${settings.withdrawalLimits.min}.`
    );
  }
  const user = await User.findById(userId);
  if (user.wallet.balance < amount) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Requested amount exceeds your available balance."
    );
  }
  const existingPendingRequest = await Withdrawal.findOne({
    user: userId,
    status: "Pending",
  });
  if (existingPendingRequest) {
    throw new AppError(
      httpStatus.CONFLICT,
      "You already have a pending withdrawal request."
    );
  }
  user.wallet.balance -= amount;
  user.wallet.pendingBalance += amount;
  const newWithdrawalRequest = await Withdrawal.create({
    user: userId,
    userRole: req.user.role,
    amount,
    beneficiaryInfo: user.beneficiaryInfo,
  });
  await user.save({ validateBeforeSave: false });
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Withdrawal request submitted successfully.",
    data: newWithdrawalRequest,
  });
});

/**
 * @description USER gets their financial overview.
 */
export const getFinancialOverview = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select("wallet");
  const transactions = await Transaction.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(10);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Financial overview fetched successfully.",
    data: { wallet: user.wallet, recentTransactions: transactions },
  });
});

/**
 * @description USER gets their transaction history.
 */
export const getTransactionHistory = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const total = await Transaction.countDocuments({ user: userId });
  const transactions = await Transaction.find({ user: userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Transaction history fetched successfully.",
    data: {
      transactions,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
    },
  });
});
