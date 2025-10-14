import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { Session } from "../model/session.model.js";
import { User } from "../model/user.model.js";
import { Settings } from "../model/settings.model.js";

/**
 * @description ADMIN gets high-level profit metrics (Total, Platform, Tutor, Location Owner).
 * @route GET /api/v1/admin/profit/metrics
 * @access Admin
 */
export const getProfitMetrics = catchAsync(async (req, res) => {
  const results = await Session.aggregate([
    { $match: { status: "Completed", price: { $gt: 0 } } },
    {
      $group: {
        _id: null,
        totalProfit: {
          $sum: { $multiply: ["$price", { $size: "$enrolledStudents" }] },
        },
        totalPlatformProfit: { $sum: "$adminCommission" },
        totalTutorProfit: { $sum: "$tutorEarnings" },
        totalLocationOwnerProfit: { $sum: "$locationOwnerEarnings" },
      },
    },
  ]);

  const metrics = results[0] || {
    totalProfit: 0,
    totalPlatformProfit: 0,
    totalTutorProfit: 0,
    totalLocationOwnerProfit: 0,
  };

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profit metrics retrieved successfully.",
    data: {
      totalProfit: metrics.totalProfit.toFixed(2),
      platformProfit: metrics.totalPlatformProfit.toFixed(2),
      tutorProfit: metrics.totalTutorProfit.toFixed(2),
      locationOwnerProfit: metrics.totalLocationOwnerProfit.toFixed(2),
    },
  });
});

/**
 * @description ADMIN gets a list of completed sessions showing the profit breakdown for each.
 * @route GET /api/v1/admin/profit/transactions
 * @access Admin
 */
export const getAllProfitTransactions = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, search } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const query = { status: "Completed", price: { $gt: 0 } };

  if (search) {
    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ],
    }).select("_id");

    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { creator: { $in: matchingUsers.map((user) => user._id) } },
      { acceptedTutor: { $in: matchingUsers.map((user) => user._id) } },
    ];
  }

  const totalTransactions = await Session.countDocuments(query);
  const sessions = await Session.find(query)
    .populate("acceptedTutor", "name email")
    .populate({
      path: "location",
      populate: { path: "owner", select: "name email" },
    })
    .sort({ "schedule.date": -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const formattedData = sessions.map((session) => ({
    id: session._id,
    date: session.schedule.date.toISOString().split("T")[0],
    totalAmount: (session.price * session.enrolledStudents.length).toFixed(2),
    platformProfit: session.adminCommission.toFixed(2),
    tutorEmail: session.acceptedTutor?.email || "N/A",
    locationOwnerEmail: session.location?.owner?.email || "N/A",
  }));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profit transactions retrieved successfully.",
    data: {
      transactions: formattedData,
      total: totalTransactions,
      page: parseInt(page),
      totalPages: Math.ceil(totalTransactions / limit),
    },
  });
});

/**
 * @description ADMIN gets the detailed profit distribution for a single completed session.
 * @route GET /api/v1/admin/profit/transactions/:sessionId
 * @access Admin
 */
export const getProfitDetails = catchAsync(async (req, res) => {
  const { sessionId } = req.params;

  const session = await Session.findOne({
    _id: sessionId,
    status: "Completed",
  });
  if (!session) {
    throw new AppError(httpStatus.NOT_FOUND, "Completed session not found.");
  }

  const settings = await Settings.getSettings();
  const totalAmount = session.price * session.enrolledStudents.length;

  const profitDistribution = [
    {
      name: "Platform",
      percentage: settings.profitDistribution.platform,
      profit: session.adminCommission.toFixed(2),
    },
    {
      name: "Tutor",
      percentage: settings.profitDistribution.tutor,
      profit: session.tutorEarnings.toFixed(2),
    },
    {
      name: "Location Owner",
      percentage: settings.profitDistribution.locationOwner,
      profit: session.locationOwnerEarnings.toFixed(2),
    },
  ];

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profit details retrieved successfully.",
    data: {
      totalAmount: totalAmount.toFixed(2),
      date: session.schedule.date.toISOString().split("T")[0],
      profitDistribution,
    },
  });
});
