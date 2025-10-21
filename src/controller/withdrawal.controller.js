import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { Withdrawal } from "../model/withdrawal.model.js";
import { User } from "../model/user.model.js";
import { Settings } from "../model/settings.model.js";
// --- THIS IS THE FIX ---
// We import createTransfer instead of createPayout
import { createTransfer } from "../utils/Stripe.service.js";

// ====================================================================
// --- USER-FACING CONTROLLERS (Tutor/LocationOwner) ---
// ====================================================================

/**
 * @description USER (Tutor/LocationOwner) requests a withdrawal from their wallet.
 * @route POST /api/v1/withdrawals/request
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
  if (amount < settings.withdrawalLimits.min) {
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
  if (!user.beneficiaryInfo?.bankName) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Please set up your beneficiary information in your profile before requesting a withdrawal."
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
 * @description USER (Tutor/LocationOwner) gets their own withdrawal history.
 * @route GET /api/v1/withdrawals/my-history
 * @access Tutor, LocationOwner
 */
export const getMyWithdrawalHistory = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const total = await Withdrawal.countDocuments({ user: userId });
  const history = await Withdrawal.find({ user: userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Your withdrawal history has been fetched successfully.",
    data: {
      history,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
    },
  });
});

// ====================================================================
// --- ADMIN-FACING CONTROLLERS ---
// ====================================================================

/**
 * @description ADMIN gets a paginated and filterable list of all withdrawal requests.
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
    .populate("user", "name email stripeAccountId")
    .populate("processedBy", "name")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Withdrawal requests retrieved successfully.",
    data: {
      withdrawals,
      total: totalWithdrawals,
      page: parseInt(page),
      totalPages: Math.ceil(totalWithdrawals / limit),
    },
  });
});

/**
 * @description ADMIN gets the details of a single withdrawal request.
 * @route GET /api/v1/admin/withdrawals/:withdrawalId
 * @access Admin
 */
export const getWithdrawalDetailsAdmin = catchAsync(async (req, res) => {
  const { withdrawalId } = req.params;
  const withdrawal = await Withdrawal.findById(withdrawalId).populate(
    "user",
    "name email stripeAccountId"
  );
  if (!withdrawal) {
    throw new AppError(httpStatus.NOT_FOUND, "Withdrawal request not found.");
  }
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Withdrawal details fetched.",
    data: withdrawal,
  });
});

/**
 * @description ADMIN approves a withdrawal request and initiates the payout.
 * @route PATCH /api/v1/admin/withdrawals/:withdrawalId/approve
 * @access Admin
 */
export const approveWithdrawalAdmin = catchAsync(async (req, res) => {
  const { withdrawalId } = req.params;
  const adminId = req.user._id;

  // --- THIS IS THE FIX ---
  // We now populate the stripeAccountId from the user, which is `select: false` in the model
  const withdrawal = await Withdrawal.findById(withdrawalId).populate(
    "user",
    "+stripeAccountId"
  );
  if (!withdrawal || withdrawal.status !== "Pending") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Withdrawal request not found or is not in 'Pending' status."
    );
  }

  if (!withdrawal.user.stripeAccountId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Cannot process payout: The user does not have a linked Stripe account."
    );
  }

  try {
    withdrawal.status = "Processing";
    await withdrawal.save();

    // --- THIS IS THE FIX ---
    // We now call createTransfer, not createPayout
    const transfer = await createTransfer(
      withdrawal.amount,
      "usd",
      withdrawal.user.stripeAccountId
    );

    withdrawal.status = "Approved";
    withdrawal.paymentGatewayPayoutId = transfer.id; // It's a transfer ID now, but we can reuse the field
    withdrawal.processedAt = new Date();
    withdrawal.processedBy = adminId;

    const user = await User.findById(withdrawal.user._id);
    user.wallet.pendingBalance -= withdrawal.amount;

    await withdrawal.save();
    await user.save({ validateBeforeSave: false });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Withdrawal approved and transfer initiated.", // Message updated for clarity
      data: withdrawal,
    });
  } catch (error) {
    const user = await User.findById(withdrawal.user._id);
    user.wallet.balance += withdrawal.amount;
    user.wallet.pendingBalance -= withdrawal.amount;

    withdrawal.status = "Failed";
    withdrawal.rejectionReason = `Stripe Transfer failed: ${error.message}`;

    await user.save({ validateBeforeSave: false });
    await withdrawal.save();

    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Transfer failed. Funds returned to user's wallet. Error: ${error.message}`
    );
  }
});

/**
 * @description ADMIN rejects a withdrawal request and returns funds to the user's wallet.
 * @route PATCH /api/v1/admin/withdrawals/:withdrawalId/reject
 * @access Admin
 */
export const rejectWithdrawalAdmin = catchAsync(async (req, res) => {
  const { withdrawalId } = req.params;
  const { reason } = req.body;
  const adminId = req.user._id;

  if (!reason)
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "A reason for rejection is required."
    );

  const withdrawal = await Withdrawal.findById(withdrawalId);
  if (!withdrawal || withdrawal.status !== "Pending") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Withdrawal request not found or is not in 'Pending' status."
    );
  }

  const user = await User.findById(withdrawal.user);
  user.wallet.balance += withdrawal.amount;
  user.wallet.pendingBalance -= withdrawal.amount;

  withdrawal.status = "Rejected";
  withdrawal.rejectionReason = reason;
  withdrawal.processedAt = new Date();
  withdrawal.processedBy = adminId;

  await user.save({ validateBeforeSave: false });
  await withdrawal.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Withdrawal rejected. Funds returned to user's wallet.",
    data: withdrawal,
  });
});
