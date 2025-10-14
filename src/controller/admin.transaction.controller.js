import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { Transaction } from "../model/transaction.model.js";
import { User } from "../model/user.model.js";
import { Session } from "../model/session.model.js";

/**
 * @description ADMIN gets a paginated and filterable list of all transactions.
 * @route GET /api/v1/admin/transactions
 * @access Admin
 */

export const getAllTransactions = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, search, type, status } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const query = {};

  if (type) query.type = type;
  if (status) query.status = status;

  if (search) {
    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ],
    }).select("_id");

    query.$or = [
      { paymentGatewayId: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { user: { $in: matchingUsers.map((user) => user._id) } },
    ];
  }

  const totalTransactions = await Transaction.countDocuments(query);
  const transactions = await Transaction.find(query)
    .populate("user", "name email")
    .populate("relatedSession", "title")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Transactions retrieved successfully for admin panel.",
    data: {
      transactions,
      total: totalTransactions,
      page: parseInt(page),
      totalPages: Math.ceil(totalTransactions / limit),
    },
  });
});

/**
 * @description ADMIN gets detailed information about a single transaction.
 * @route GET /api/v1/admin/transactions/:transactionId
 * @access Admin
 */

export const getTransactionDetails = catchAsync(async (req, res) => {
  const { transactionId } = req.params;
  const transaction = await Transaction.findById(transactionId)
    .populate("user", "name email")
    .populate("relatedSession", "title");

  if (!transaction) {
    throw new AppError(httpStatus.NOT_FOUND, "Transaction not found.");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Transaction details retrieved successfully.",
    data: transaction,
  });
});

/**
 * @description ADMIN processes a refund for a completed payment transaction.
 * @route POST /api/v1/admin/transactions/:transactionId/refund
 * @access Admin
 */
export const processRefund = catchAsync(async (req, res) => {
  const { transactionId } = req.params;
  const { refundAmount, reason } = req.body;

  const originalTransaction = await Transaction.findById(transactionId);

  if (
    !originalTransaction ||
    originalTransaction.type !== "Payment" ||
    originalTransaction.status !== "Completed"
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Cannot refund this transaction. It must be a completed payment."
    );
  }
  if (
    !refundAmount ||
    refundAmount <= 0 ||
    refundAmount > originalTransaction.amount
  ) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid refund amount.");
  }


  const refundTransaction = await Transaction.create({
    user: originalTransaction.user,
    type: "Refund",
    amount: refundAmount,
    status: "Completed",
    paymentGateway: "Stripe",
    // paymentGatewayId: stripeRefund.id, // Use the actual refund ID from Stripe
    description: `Refund for transaction ${originalTransaction._id}. Reason: ${
      reason || "N/A"
    }`,
    sourceTransaction: originalTransaction._id,
  });

  // Update the original transaction's status
  originalTransaction.status =
    refundAmount === originalTransaction.amount
      ? "Refunded"
      : "PartiallyRefunded";
  await originalTransaction.save();

  // TODO: Add logic to deduct the refunded amount from Tutor/LocationOwner wallets if already paid out.

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Refund of $${refundAmount.toFixed(2)} processed successfully.`,
    data: refundTransaction,
  });
});
