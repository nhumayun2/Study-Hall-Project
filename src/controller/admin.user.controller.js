import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { User } from "../model/user.model.js";

/**
 * @description ADMIN gets a paginated and filterable list of all users.
 * @route GET /api/v1/admin/users
 * @access Admin
 */
export const getAllUsers = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, search, role, status } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const query = {};

  // Filter by Role
  if (role) {
    query.role = role;
  }
  // Filter by Status
  if (status) {
    query.status = status; // Assumes 'Active', 'Inactive', 'Blocked'
  }
  // Search filter (by Name or Email)
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const totalUsers = await User.countDocuments(query);
  const users = await User.find(query)
    .select("-password -refreshToken -verificationInfo") // Exclude sensitive fields
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Users retrieved successfully for admin panel.",
    data: {
      users,
      total: totalUsers,
      page: parseInt(page),
      totalPages: Math.ceil(totalUsers / limit),
    },
  });
});

/**
 * @description ADMIN gets detailed information about a single user.
 * @route GET /api/v1/admin/users/:userId
 * @access Admin
 */
export const getUserDetails = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const user = await User.findById(userId).select("-password -refreshToken");

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found.");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User details retrieved successfully.",
    data: user,
  });
});

/**
 * @description ADMIN updates the status of a user (e.g., Active, Inactive, Blocked).
 * @route PATCH /api/v1/admin/users/:userId/status
 * @access Admin
 */
export const updateUserStatus = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { status } = req.body;

  const validStatuses = ["Active", "Inactive", "Blocked"];
  if (!status || !validStatuses.includes(status)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Invalid status provided. Must be one of: ${validStatuses.join(", ")}.`
    );
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found.");
  }
  if (user.role === "Admin") {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Cannot change the status of another admin account."
    );
  }

  user.status = status;
  await user.save({ validateBeforeSave: false });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `User status has been successfully updated to '${status}'.`,
    data: { userId: user._id, newStatus: user.status },
  });
});
