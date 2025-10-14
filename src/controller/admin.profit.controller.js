import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import AppError from "../errors/AppError.js";
import { Transaction } from "../model/transaction.model.js"; // Assuming a Transaction model exists
import { Session } from "../model/session.model.js"; // Needed to link transactions back to session details (e.g., tutor/location)
import { User } from "../model/user.model.js";

// Constants (These should ideally be fetched from a Settings Model, but are hardcoded for logic demo)
const PLATFORM_COMMISSION_RATE = 0.2; // 20%
const LOCATION_OWNER_RATE = 0.1; // 10%
const TUTOR_EARNINGS_RATE =
  1.0 - PLATFORM_COMMISSION_RATE - LOCATION_OWNER_RATE; // 70%

/**
 * Utility function to calculate profit distribution for a single transaction.
 * @param {number} totalAmount - The total transaction amount (session price).
 * @returns {object} Profit breakdown.
 */
const calculateProfitDistribution = (totalAmount) => {
  // Ensure total amount is a valid number
  const amount = parseFloat(totalAmount) || 0;

  // Calculate distributions
  const platformProfit = amount * PLATFORM_COMMISSION_RATE;
  const locationOwnerProfit = amount * LOCATION_OWNER_RATE;
  const tutorProfit = amount * TUTOR_EARNINGS_RATE;

  // Return object with profits and percentages
  return {
    platform: {
      amount: platformProfit,
      percentage: PLATFORM_COMMISSION_RATE * 100,
    },
    tutor: {
      amount: tutorProfit,
      percentage: TUTOR_EARNINGS_RATE * 100,
    },
    locationOwner: {
      amount: locationOwnerProfit,
      percentage: LOCATION_OWNER_RATE * 100,
    },
    total: amount,
  };
};

/**
 * @desc Admin: Get high-level profit metrics (Total, Platform, Tutor, Landlord)
 * @route GET /api/v1/admin/profit/metrics
 * @access Admin
 * Used for the summary cards at the top of the Profit page (Total Profit, Platform Profit, etc.)
 */
export const getProfitMetricsAdmin = catchAsync(async (req, res) => {
  // 1. Fetch all successfully 'Paid' transactions
  const paidTransactions = await Transaction.find({
    status: "Completed",
    type: "Payment",
  });

  let totalProfit = 0;
  let platformProfit = 0;
  let tutorProfit = 0;
  let locationOwnerProfit = 0;

  // 2. Iterate and calculate totals
  paidTransactions.forEach((transaction) => {
    // We assume transaction.amount is the total paid for the session
    const distribution = calculateProfitDistribution(transaction.amount);

    totalProfit += distribution.total;
    platformProfit += distribution.platform.amount;
    tutorProfit += distribution.tutor.amount;
    locationOwnerProfit += distribution.locationOwner.amount;
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profit metrics retrieved successfully.",
    data: {
      totalProfit: totalProfit.toFixed(2),
      platformProfit: platformProfit.toFixed(2),
      tutorProfit: tutorProfit.toFixed(2),
      locationOwnerProfit: locationOwnerProfit.toFixed(2),
    },
  });
});

/**
 * @desc Admin: Get recent profit transactions list
 * @route GET /api/v1/admin/profit
 * @access Admin
 * Used for the main table view showing 'Recent Users/Transactions'.
 */
export const getAllProfitTransactionsAdmin = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, search, startDate, endDate } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const query = {
    status: "Completed", // Only consider successful payments for profit
    type: "Payment",
    // We will filter by date range later if provided
  };

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      query.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      query.createdAt.$lte = new Date(endDate);
    }
  }

  const totalTransactions = await Transaction.countDocuments(query);
  const transactions = await Transaction.find(query)
    .populate("session", "tutor location") // Populate session to get tutor/location IDs
    .populate("user", "email") // User who initiated the transaction (Student)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  // 3. Format data and calculate profit breakdown for each entry
  const formattedData = await Promise.all(
    transactions.map(async (transaction) => {
      const distribution = calculateProfitDistribution(transaction.amount);

      // Fetch Tutor and Location Owner email from the linked Session
      let tutorEmail = "N/A";
      let locationOwnerEmail = "N/A";

      if (transaction.session) {
        // Find Tutor email
        if (transaction.session.tutor) {
          const tutorUser = await User.findById(
            transaction.session.tutor
          ).select("email");
          tutorEmail = tutorUser?.email || "N/A";
        }

        // Find Location Owner email (assuming Location model links to owner)
        if (transaction.session.location) {
          // NOTE: This assumes Session.location is the ID of a Location model
          // which, in turn, has a field linking to the Location Owner's User ID.
          // For simplicity, we'll placeholder this or rely on a specific field.
          locationOwnerEmail = "location@example.com"; // Placeholder
        }
      }

      return {
        id: transaction._id,
        date: transaction.createdAt.toISOString().split("T")[0],
        totalAmount: distribution.total.toFixed(2),
        platformProfit: distribution.platform.amount.toFixed(2),
        tutorProfit: distribution.tutor.amount.toFixed(2),
        locationOwnerEmail: locationOwnerEmail, // Corresponds to Landlord in Figma
        tutorEmail: tutorEmail,
      };
    })
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profit transactions retrieved successfully.",
    data: {
      transactions: formattedData,
      total: totalTransactions,
      page: parseInt(page),
      limit: parseInt(limit),
    },
  });
});

/**
 * @desc Admin: Get detail view of a single profit transaction
 * @route GET /api/v1/admin/profit/:transactionId
 * @access Admin
 * Used for the "Profit Detail" modal view.
 */
export const getProfitDetailsAdmin = catchAsync(async (req, res) => {
  const { transactionId } = req.params;

  const transaction = await Transaction.findOne({
    _id: transactionId,
    status: "Completed",
    type: "Payment",
  }).populate("session", "tutor location"); // Need session info for details

  if (!transaction) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Completed profit transaction not found."
    );
  }

  const distribution = calculateProfitDistribution(transaction.amount);

  // Format the distribution for the detail table
  const profitDistribution = [
    {
      name: "Platform",
      percentage: distribution.platform.percentage,
      profit: distribution.platform.amount.toFixed(2),
    },
    {
      name: "Tutor",
      percentage: distribution.tutor.percentage,
      profit: distribution.tutor.amount.toFixed(2),
    },
    {
      name: "Location Owner", // Corresponds to Landlord in Figma
      percentage: distribution.locationOwner.percentage,
      profit: distribution.locationOwner.amount.toFixed(2),
    },
  ];

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profit details retrieved successfully.",
    data: {
      totalAmount: distribution.total.toFixed(2),
      date: transaction.createdAt.toISOString().split("T")[0],
      profitDistribution: profitDistribution,
    },
  });
});
