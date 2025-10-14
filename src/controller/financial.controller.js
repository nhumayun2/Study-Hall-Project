import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { createPaymentIntent as createStripePaymentIntent } from "../utils/Stripe.service.js";
import { Session } from "../model/session.model.js";
import { User } from "../model/user.model.js";
import { Transaction } from "../model/transaction.model.js";
import { Withdrawal } from "../model/withdrawal.model.js";
import { Settings } from "../model/settings.model.js";

// ====================================================================
// --- PAYMENT FLOW ---
// ====================================================================

/**
 * @description STUDENT pre-authorizes payment for a session before booking.
 * @route POST /api/v1/financials/session/:sessionId/create-payment-intent
 * @access Student
 */
export const createPaymentIntentForSession = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const session = await Session.findById(sessionId).populate("acceptedTutor");

  if (!session) {
    throw new AppError(httpStatus.NOT_FOUND, "Session not found.");
  }
  if (session.price <= 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This session is free and does not require payment authorization."
    );
  }
  if (!session.acceptedTutor?.stripeAccountId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "The tutor for this session is not configured to receive payments. Please contact support."
    );
  }

  // Call the Stripe service to create a payment intent
  const { clientSecret, paymentIntentId } = await createStripePaymentIntent(
    session.price,
    session.acceptedTutor.stripeAccountId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message:
      "Payment intent created successfully. Please confirm the payment on the client side.",
    data: { clientSecret, paymentIntentId },
  });
});

// ====================================================================
// --- WITHDRAWAL FLOW ---
// ====================================================================

/**
 * @description USER (Tutor/LocationOwner) requests a withdrawal from their wallet.
 * @route POST /api/v1/financials/request-withdrawal
 * @access Tutor, LocationOwner
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
  if (amount < settings.minWithdrawalAmount) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Minimum withdrawal amount is $${settings.minWithdrawalAmount}.`
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

  // Reserve the funds by moving them from available to pending
  user.wallet.balance -= amount;
  user.wallet.pendingBalance += amount;

  const newWithdrawalRequest = await Withdrawal.create({
    user: userId,
    userRole: req.user.role,
    amount,
    beneficiaryInfo: user.beneficiaryInfo, // Snapshot the user's info at time of request
  });

  await user.save({ validateBeforeSave: false });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message:
      "Withdrawal request submitted successfully. It is now pending admin review.",
    data: newWithdrawalRequest,
  });
});

// ====================================================================
// --- FINANCIAL OVERVIEW & HISTORY ---
// ====================================================================

/**
 * @description Get financial overview for the authenticated user (Wallet, History).
 * @route GET /api/v1/financials/overview
 * @access Authenticated
 */
export const getFinancialOverview = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select("wallet");
  const transactions = await Transaction.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(10); // Get last 10 transactions

  const overview = {
    wallet: user.wallet,
    recentTransactions: transactions,
  };

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Financial overview fetched successfully.",
    data: overview,
  });
});

/**
 * @description Get transaction history for the authenticated user with pagination.
 * @route GET /api/v1/financials/transactions
 * @access Authenticated
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
