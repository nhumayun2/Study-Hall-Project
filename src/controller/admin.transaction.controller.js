import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { Transaction } from "../model/transaction.model.js";
import { User } from "../model/user.model.js";
import { Session } from "../model/session.model.js";
import mongoose from "mongoose";

/**
 * Fetches all transactions for the Admin panel with filtering, searching, and pagination.
 * The transactions include payments, refunds, and internal transfers/fees.
 */
export const getAllTransactionsAdmin = catchAsync(async (req, res) => {
  const { search, category, status, type, page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const query = {};

  // 1. Filtering by Status and Type (e.g., Pending, Completed, Payment, Refund)
  if (status) {
    query.status = status;
  }
  if (type) {
    query.type = type;
  }

  // 2. Searching (by Transaction ID, Customer Name/Email, Content/Session Title)
  if (search) {
    // We need to search both Transaction fields and potentially related User/Session data
    const searchRegex = { $regex: search, $options: "i" };

    // Find users matching the search term (for customer name/email)
    const matchingUsers = await User.find({
      $or: [{ name: searchRegex }, { email: searchRegex }],
    }).select("_id");
    const userIds = matchingUsers.map((user) => user._id);

    // Find sessions matching the search term (for content/session title)
    const matchingSessions = await Session.find({
      title: searchRegex,
    }).select("_id");
    const sessionIds = matchingSessions.map((session) => session._id);

    query.$or = [
      { transactionId: searchRegex }, // Search by transaction ID
      { user: { $in: userIds } }, // Search by user (customer)
      { session: { $in: sessionIds } }, // Search by session content
    ];
  }

  // 3. Category (Category filtering logic could be complex depending on how Category relates to Transaction,
  // often via Session/Course. For simplicity, we skip direct category filtering on Transaction model for now.)
  // If we were to implement it, it would require populating the session and then checking its course category.

  const transactions = await Transaction.find(query)
    .populate("user", "name email") // The user who initiated the payment/refund/withdrawal (Customer/Tutor)
    .populate("session", "title") // The related session title
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const totalTransactions = await Transaction.countDocuments(query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "All transactions fetched successfully for admin view",
    data: {
      transactions,
      total: totalTransactions,
      page: parseInt(page),
      limit: parseInt(limit),
    },
  });
});

/**
 * Fetches details of a specific transaction for the modal view.
 */
export const getTransactionDetailsAdmin = catchAsync(async (req, res) => {
  const { transactionId } = req.params;

  const transaction = await Transaction.findById(transactionId)
    .populate("user", "name email")
    .populate("session", "title")
    .populate("tutor", "name email"); // Assuming a transaction might also reference the tutor/beneficiary

  if (!transaction) {
    throw new AppError(httpStatus.NOT_FOUND, "Transaction not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Transaction details fetched successfully",
    data: transaction,
  });
});

/**
 * Processes a refund for a transaction.
 * NOTE: This is a simulation. In a real app, this would involve calling the payment gateway (e.g., Stripe API).
 */
export const processRefundAdmin = catchAsync(async (req, res) => {
  const { transactionId } = req.params;
  const { refundPercentage, note } = req.body;

  // 1. Basic Validation
  if (
    typeof refundPercentage !== "number" ||
    refundPercentage <= 0 ||
    refundPercentage > 100
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Invalid refund percentage. Must be between 0 and 100."
    );
  }

  const transaction = await Transaction.findById(transactionId);

  if (!transaction) {
    throw new AppError(httpStatus.NOT_FOUND, "Original transaction not found.");
  }

  // 2. Check if the original transaction is a successful payment and not already refunded/completed
  if (transaction.type !== "payment" || transaction.status !== "completed") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Cannot refund a non-payment or a transaction that is not completed."
    );
  }

  // Check if a full refund has already been processed for this transaction
  const existingRefund = await Transaction.findOne({
    sourceTransaction: transaction._id,
    type: "refund",
    status: "completed",
  });

  if (existingRefund && refundPercentage === 100) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "A full refund has already been completed for this transaction."
    );
  }

  // 3. Calculate refund amount
  const originalAmount = transaction.amount;
  const refundAmount = originalAmount * (refundPercentage / 100);

  if (refundAmount <= 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Calculated refund amount is zero or negative."
    );
  }

  // --- 4. SIMULATE PAYMENT GATEWAY REFUND CALL ---
  // In a real application, you would call Stripe/PayPal here:
  // const paymentGatewayResponse = await stripe.refunds.create({
  //     charge: transaction.gatewayChargeId,
  //     amount: refundAmount * 100 // amounts are usually in cents
  // });
  // Assume success for simulation purposes:
  const paymentGatewaySuccess = true;

  // 5. Update system records
  if (paymentGatewaySuccess) {
    // Create a new Refund Transaction record
    const refundTransaction = await Transaction.create({
      transactionId: `R${Date.now()}${transactionId.slice(-4)}`, // Unique refund ID
      user: transaction.user,
      amount: refundAmount,
      type: "refund",
      status: "completed", // Assuming instant completion for simulation
      sourceTransaction: transaction._id,
      note: `Refunded ${refundPercentage}% (${refundAmount.toFixed(
        2
      )} USD). Admin Note: ${note || "N/A"}`,
      // Important: You would also adjust the platform/tutor/owner profit records if applicable.
    });

    // Optionally, update the original transaction status to reflect the refund
    const newOriginalStatus =
      refundPercentage === 100 ? "refunded" : "partially-refunded";
    transaction.status = newOriginalStatus;
    await transaction.save();

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: `Refund of ${refundAmount.toFixed(
        2
      )} USD (${refundPercentage}%) successfully processed.`,
      data: refundTransaction,
    });
  } else {
    // Handle real-world payment gateway error
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Payment gateway failed to process the refund."
    );
  }
});
