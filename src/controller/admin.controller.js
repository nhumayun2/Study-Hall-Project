import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { User } from "../model/user.model.js";
import { Course } from "../model/course.model.js";
import { Location } from "../model/location.model.js";
import { Transaction } from "../model/transaction.model.js";
import { TutorApplication } from "../model/tutorApplication.model.js";

/**
 * Helper function to calculate the start date for a time range (e.g., last 6 months)
 * @param {number} monthsAgo
 * @returns {Date}
 */
const getStartDate = (monthsAgo) => {
  const date = new Date();
  date.setMonth(date.getMonth() - monthsAgo);
  date.setDate(1); // Start from the 1st of the month
  date.setHours(0, 0, 0, 0);
  return date;
};

// --- CORE DASHBOARD METRICS (Total Counts, Financials, Statuses) ---

export const getAdminDashboardMetrics = catchAsync(async (req, res) => {
  // 1. Main Counts
  const totalUsers = await User.countDocuments();
  const totalTutors = await User.countDocuments({ role: "tutor" });
  const totalCourses = await Course.countDocuments({ status: "active" }); // 2. Tutor Application Status Counts (Total, Accepted, Pending, Rejected)

  const applicationStats = await TutorApplication.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const applicationCounts = {
    totalApplications: await TutorApplication.countDocuments(),
    pending: applicationStats.find((s) => s._id === "pending")?.count || 0,
    approved: applicationStats.find((s) => s._id === "approved")?.count || 0,
    rejected: applicationStats.find((s) => s._id === "rejected")?.count || 0,
  }; // 3. Financial Metrics (Simulated system commission)

  const successfulPayments = await Transaction.find({
    type: "payment",
    status: "success",
  }); // Assuming a 10% commission fee is applied to all successful payments

  const totalSystemRevenue = successfulPayments.reduce(
    (sum, t) => sum + t.amount * 0.1, // 10% commission
    0
  );

  const pendingWithdrawalsCount = await Transaction.countDocuments({
    type: "withdrawal",
    status: "pending",
  });

  const metrics = {
    totalUsers,
    totalTutors,
    totalCourses,
    ...applicationCounts,
    totalSystemRevenue: totalSystemRevenue.toFixed(2),
    pendingWithdrawalsCount,
  };

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Dashboard metrics fetched successfully",
    data: metrics,
  });
});

// --- GRAPH DATA 1: TUTOR APPLICATION RATIO ---

export const getTutorApplicationStats = catchAsync(async (req, res) => {
  const startDate = getStartDate(6);

  const monthlyApplications = await TutorApplication.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: {
          month: { $month: "$createdAt" },
          year: { $year: "$createdAt" },
        },
        totalSubmitted: { $sum: 1 },
        approved: {
          $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] },
        },
        rejected: {
          $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] },
        },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);

  sendResponse(res, { 
    statusCode: httpStatus.OK,
    success: true,
    message: "Monthly tutor application stats fetched.",
    data: monthlyApplications,
  });
});

// --- GRAPH DATA 2: USER ACTIVITY (Active vs. Inactive Users) ---

export const getUserActivityStats = catchAsync(async (req, res) => {
  const startDate = getStartDate(6); // We track user creation over the last 6 months and count their status at creation

  const monthlyUserActivity = await User.aggregate([
    { $match: { createdAt: { $gte: startDate }, role: { $ne: "admin" } } },
    {
      $group: {
        _id: {
          month: { $month: "$createdAt" },
          year: { $year: "$createdAt" },
        },
        newActive: {
          $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] },
        },
        newInactive: {
          $sum: { $cond: [{ $eq: ["$isActive", false] }, 1, 0] },
        },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Monthly user activity stats fetched.",
    data: monthlyUserActivity,
  });
});

// --- TABLE DATA: RECENT USERS ---

export const getRecentUsers = catchAsync(async (req, res) => {
  const recentUsers = await User.find({ role: { $ne: "admin" } })
    .select("_id name email role isActive createdAt")
    .sort({ createdAt: -1 })
    .limit(10); // Show top 10 recent users for the dashboard table // Map data to fit the required table format (User ID, User Name, Type, Email, STATUS, Action)

  const formattedUsers = recentUsers.map((user) => ({
    userId: user._id,
    userName: user.name,
    type: user.role, // role serves as the user type
    email: user.email,
    status: user.isActive ? "Active" : "Blocked", // isActive determines STATUS // Frontend will use userId to call the toggleUserStatus action
  }));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Recent users fetched successfully.",
    data: formattedUsers,
  });
});

// --- User Management (Existing logic from previous file) ---

export const getAllUsers = catchAsync(async (req, res) => {
  const users = await User.find({ role: { $ne: "admin" } }).select(
    "-password -refreshToken"
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "All users fetched successfully",
    data: users,
  });
});

export const toggleUserStatus = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.role === "admin") {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Cannot block or unblock another admin."
    );
  }

  user.isActive = !user.isActive;
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `User account successfully ${
      user.isActive ? "activated (unblocked)" : "deactivated (blocked)"
    }.`,
    data: { isActive: user.isActive },
  });
});

// --- Course Management (Existing logic from previous file) ---

export const getAllCoursesForAdmin = catchAsync(async (req, res) => {
  const courses = await Course.find({})
    .populate("tutor", "name email")
    .populate("category", "name")
    .populate("subCategory", "name")
    .sort({ createdAt: -1 });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "All courses fetched for admin successfully",
    data: courses,
  });
});

export const toggleCourseStatus = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const { status } = req.body; // Expect 'active', 'deactivated', or 'blocked'

  const course = await Course.findByIdAndUpdate(
    courseId,
    { status: status },
    { new: true }
  );

  if (!course) {
    throw new AppError(httpStatus.NOT_FOUND, "Course not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Course status updated to ${status} successfully.`,
    data: course,
  });
});

// --- Location Management (Existing logic from previous file) ---

export const getAllLocationsForReview = catchAsync(async (req, res) => {
  // Assuming locations awaiting review have a specific status field, e.g., 'pending'
  const locations = await Location.find({ status: "pending" }).populate(
    "owner",
    "user businessName"
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Pending locations for review fetched successfully",
    data: locations,
  });
});

export const reviewLocation = catchAsync(async (req, res) => {
  const { locationId } = req.params;
  const { status, reason } = req.body; // status: 'approved' or 'rejected'

  const location = await Location.findById(locationId);

  if (!location) {
    throw new AppError(httpStatus.NOT_FOUND, "Location not found");
  }
  if (!["approved", "rejected"].includes(status)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid status provided.");
  }

  location.status = status;
  if (status === "rejected") {
    location.rejectionReason = reason;
  }
  await location.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Location ${status} successfully.`,
    data: location,
  });
});

// --- Financial Management (Existing logic from previous file) ---

export const getPendingWithdrawals = catchAsync(async (req, res) => {
  const withdrawals = await Transaction.find({
    type: "withdrawal",
    status: "pending",
  }).populate("user", "name email");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Pending withdrawal requests fetched successfully",
    data: withdrawals,
  });
});

export const reviewWithdrawal = catchAsync(async (req, res) => {
  const { transactionId } = req.params;
  const { status, reason } = req.body; // status: 'approved' or 'rejected'

  const withdrawal = await Transaction.findById(transactionId);

  if (!withdrawal || withdrawal.type !== "withdrawal") {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Withdrawal transaction not found"
    );
  }

  if (withdrawal.status !== "pending") {
    throw new AppError(httpStatus.BAD_REQUEST, "Withdrawal already processed.");
  }

  withdrawal.status = status;
  if (status === "rejected") {
    withdrawal.rejectionReason = reason;
  } // TODO: If approved, implement Stripe payout logic here.
  await withdrawal.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Withdrawal request ${status} successfully.`,
    data: withdrawal,
  });
});

// --- System Notification (Existing logic from previous file) ---

export const sendSystemNotification = catchAsync(async (req, res) => {
  const { targetRole, title, message } = req.body;
  const recipientQuery = targetRole === "all" ? {} : { role: targetRole }; // Fetch all target users

  const users = await User.find(recipientQuery).select("_id"); // Bulk create notifications (simplified loop for demonstration)

  const notificationsPromises = users.map((user) => {
    // Assuming Notification model is available
    return new Notification({
      recipient: user._id,
      type: "System",
      title,
      message,
    }).save();
  }); // Execute all promises

  await Promise.all(notificationsPromises);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: `System notification sent to ${users.length} users.`,
    data: null,
  });
});
