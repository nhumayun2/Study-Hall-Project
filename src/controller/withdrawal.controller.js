import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import AppError from "../errors/AppError.js";
import { Withdrawal } from "../model/withdrawal.model.js";
import { User } from "../model/user.model.js";
import { stripe, createPayout } from "../utils/Stripe.service.js";
import { uniqueTransactionId } from "../utils/commonMethod.js";

// Configuration for minimum withdrawal
const MIN_WITHDRAWAL_AMOUNT = 20;

// =============================================================
// --- USER-FACING WITHDRAWAL CONTROLLERS (Tutor/LocationOwner) ---
// =============================================================

/**
 * @desc User: Request a new withdrawal (Tutor/LocationOwner)
 * @route POST /api/v1/withdrawals/request
 * @access Tutor, LocationOwner
 */
export const requestWithdrawalUser = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const userRole = req.user.role;
  const { amount, payoutMethod = "Stripe" } = req.body; // 1. Basic validation

  if (!amount || typeof amount !== "number" || amount <= 0) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid withdrawal amount.");
  }

  if (amount < MIN_WITHDRAWAL_AMOUNT) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Minimum withdrawal amount is $${MIN_WITHDRAWAL_AMOUNT}.`
    );
  } // 2. Check user's current available balance
  const user = await User.findById(userId).select(
    "availableBalance stripeAccountId"
  );
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found.");
  }

  if (user.availableBalance < amount) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Requested amount exceeds your available balance."
    );
  } // 3. Check for existing pending requests
  const existingPending = await Withdrawal.findOne({
    user: userId,
    status: "Pending",
  });
  if (existingPending) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You already have a pending withdrawal request."
    );
  } // 4. Basic check for Stripe integration if Stripe is selected
  if (payoutMethod.toLowerCase().includes("stripe") && !user.stripeAccountId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Please link your Stripe account before requesting a withdrawal via Stripe."
    );
  } // 5. Create the withdrawal request
  const newRequest = await Withdrawal.create({
    user: userId,
    userRole: userRole,
    amount: amount,
    payoutMethod: payoutMethod,
    status: "Pending",
  }); // 6. Deduct the requested amount from the user's available balance (reserved funds)
  user.availableBalance -= amount;
  await user.save({ validateBeforeSave: false });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message:
      "Withdrawal request submitted successfully. It is now pending admin review.",
    data: newRequest,
  });
});

/**
 * @desc User: Get their withdrawal history
 * @route GET /api/v1/withdrawals/history
 * @access Tutor, LocationOwner
 */
export const getUserWithdrawalHistory = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const query = { user: userId };
  const total = await Withdrawal.countDocuments(query);
  const history = await Withdrawal.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Withdrawal history retrieved successfully.",
    data: {
      history,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    },
  });
});

// =============================================================
// --- ADMIN-FACING WITHDRAWAL CONTROLLERS ---
// =============================================================

/**
 * @desc Admin: Get all withdrawal requests with filtering and pagination
 * @route GET /api/v1/admin/withdrawals
 * @access Admin
 */
export const getAllWithdrawalsAdmin = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, status, userRole } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const query = {};

  if (status) query.status = status;
  if (userRole) query.userRole = userRole;

  const totalWithdrawals = await Withdrawal.countDocuments(query);
  const withdrawals = await Withdrawal.find(query)
    .populate("user", "name email phone role stripeAccountId") // Populate user details including Stripe ID for admin action
    .populate("processedBy", "name email") // Admin who processed it
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Withdrawal requests retrieved successfully for Admin Panel",
    data: {
      withdrawals,
      total: totalWithdrawals,
      page: parseInt(page),
      limit: parseInt(limit),
    },
  });
});

/**
 * @desc Admin: Approve a withdrawal request and initiate Stripe Payout
 * @route PATCH /api/v1/admin/withdrawals/:withdrawalId/approve
 * @access Admin
 */
export const approveWithdrawalAdmin = catchAsync(async (req, res) => {
  const { withdrawalId } = req.params;
  const adminId = req.user._id;

  const withdrawal = await Withdrawal.findById(withdrawalId).populate(
    "user",
    "stripeAccountId"
  );

  if (!withdrawal) {
    throw new AppError(httpStatus.NOT_FOUND, "Withdrawal request not found.");
  }
  if (withdrawal.status !== "Pending") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Withdrawal is not in Pending status. Current status: ${withdrawal.status}`
    );
  } // Check if Stripe is the method, and if user has a connected account
  if (
    withdrawal.payoutMethod.toLowerCase().includes("stripe") &&
    !withdrawal.user.stripeAccountId
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "User does not have a linked Stripe account for this payout method."
    );
  } // --- 1. Process Payout via Stripe (if using Stripe) ---
  let payoutResult;
  if (withdrawal.payoutMethod.toLowerCase().includes("stripe")) {
    try {
      // Update status to Processing right before calling external service
      withdrawal.status = "Processing";
      await withdrawal.save();
      payoutResult = await createPayout(
        withdrawal.amount,
        "usd", // Assuming USD
        withdrawal.user.stripeAccountId
      );
    } catch (stripeError) {
      // If Stripe fails, update status to Failed and re-credit the user's balance
      const userToUpdate = await User.findById(withdrawal.user._id);
      if (userToUpdate) {
        userToUpdate.availableBalance += withdrawal.amount; // Re-credit funds
        await userToUpdate.save({ validateBeforeSave: false });
      }
      withdrawal.status = "Failed";
      withdrawal.rejectionReason = `Stripe Payout failed: ${stripeError.message}`;
      withdrawal.processedBy = adminId;
      withdrawal.processedAt = new Date();
      await withdrawal.save();

      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        `Payout failed. Funds re-credited. Error: ${stripeError.message}`
      );
    }
  } // --- 2. Finalize Approval ---
  withdrawal.status = "Approved";
  withdrawal.transactionId = payoutResult?.id || uniqueTransactionId(); // Use Stripe ID or generate fallback
  withdrawal.processedAt = new Date();
  withdrawal.processedBy = adminId;
  const approvedWithdrawal = await withdrawal.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Withdrawal of $${withdrawal.amount} approved and ${withdrawal.payoutMethod} payout initiated.`,
    data: approvedWithdrawal,
  });
});

/**
 * @desc Admin: Reject a withdrawal request
 * @route PATCH /api/v1/admin/withdrawals/:withdrawalId/reject
 * @access Admin
 */
export const rejectWithdrawalAdmin = catchAsync(async (req, res) => {
  const { withdrawalId } = req.params;
  const adminId = req.user._id;
  const { rejectionReason } = req.body;

  if (!rejectionReason || rejectionReason.trim().length < 10) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "A detailed rejection reason (min 10 characters) is required."
    );
  }

  const withdrawal = await Withdrawal.findById(withdrawalId);
  if (!withdrawal) {
    throw new AppError(httpStatus.NOT_FOUND, "Withdrawal request not found.");
  }
  if (withdrawal.status !== "Pending") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Only Pending requests can be rejected."
    );
  } // --- 1. Update status and save reason ---
  withdrawal.status = "Rejected";
  withdrawal.rejectionReason = rejectionReason;
  withdrawal.processedAt = new Date();
  withdrawal.processedBy = adminId; // Record the admin who rejected the request
  const rejectedWithdrawal = await withdrawal.save(); // --- 2. Re-credit the user's available balance --- // Find user and re-add the rejected amount back to their available balance
  const userToUpdate = await User.findById(rejectedWithdrawal.user);
  if (userToUpdate) {
    userToUpdate.availableBalance += rejectedWithdrawal.amount;
    await userToUpdate.save({ validateBeforeSave: false });
  } else {
    console.error(
      `CRITICAL: User ID ${rejectedWithdrawal.user} not found for withdrawal re-credit.`
    );
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Withdrawal request rejected. Funds re-credited to user balance.",
    data: rejectedWithdrawal,
  });
});
