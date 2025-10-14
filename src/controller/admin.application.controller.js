import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { TutorApplication } from "../model/tutorApplication.model.js";
import { User } from "../model/user.model.js";

/**
 * Admin: Fetches all tutor applications with filtering and pagination.
 */
export const getAllTutorApplications = catchAsync(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const query = {};

  // Filter by application status (pending, approved, rejected)
  if (status) {
    if (!["pending", "approved", "rejected"].includes(status)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid status filter.");
    }
    query.status = status;
  } else {
    // By default, show pending applications first
    query.status = "pending";
  }

  const applications = await TutorApplication.find(query)
    .populate("user", "name email role createdAt") // Populate user info for context
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const totalApplications = await TutorApplication.countDocuments(query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Tutor applications fetched successfully",
    data: {
      applications,
      total: totalApplications,
      page: parseInt(page),
      limit: parseInt(limit),
    },
  });
});

/**
 * Admin: Get detailed information for a single application.
 */
export const getTutorApplicationDetails = catchAsync(async (req, res) => {
  const { applicationId } = req.params;

  const application = await TutorApplication.findById(applicationId).populate(
    "user",
    "name email role phone avatar"
  ); // Get all necessary user data

  if (!application) {
    throw new AppError(httpStatus.NOT_FOUND, "Tutor application not found.");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Tutor application details fetched successfully",
    data: application,
  });
});

/**
 * Admin: Approves a tutor application, updating its status and promoting the user's role.
 */
export const approveTutorApplication = catchAsync(async (req, res) => {
  const { applicationId } = req.params;

  const application = await TutorApplication.findById(applicationId);

  if (!application) {
    throw new AppError(httpStatus.NOT_FOUND, "Tutor application not found.");
  }

  if (application.status === "approved") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Application is already approved."
    );
  }

  // 1. Update Application Status
  application.status = "approved";
  await application.save();

  // 2. Promote User Role
  const user = await User.findById(application.user);

  if (!user) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "User associated with this application not found."
    );
  }

  // Check if the user is not already a tutor (or admin/owner)
  if (user.role === "Student") {
    user.role = "Tutor";
    // Ensure the account is active upon approval
    user.isActive = true;
    await user.save();
  } else if (user.role === "Tutor") {
    // Allow re-approval but skip role change if already set
  } else {
    // Prevent approval if they are an admin or location owner (shouldn't happen, but good check)
    throw new AppError(
      httpStatus.FORBIDDEN,
      `Cannot promote user with role: ${user.role}`
    );
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message:
      "Tutor application approved and user successfully promoted to Tutor.",
    data: { application, userRole: user.role },
  });
});

/**
 * Admin: Rejects a tutor application.
 */
export const rejectTutorApplication = catchAsync(async (req, res) => {
  const { applicationId } = req.params;
  const { rejectionReason } = req.body; // Reason is highly recommended for feedback

  if (!rejectionReason || rejectionReason.length < 10) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Rejection reason is required and should be descriptive."
    );
  }

  const application = await TutorApplication.findById(applicationId);

  if (!application) {
    throw new AppError(httpStatus.NOT_FOUND, "Tutor application not found.");
  }

  if (application.status === "rejected") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Application is already rejected."
    );
  }

  // Update Application Status and add rejection reason
  application.status = "rejected";
  application.rejectionReason = rejectionReason;
  await application.save();

  // NOTE: We don't change the user's role from 'Student', but we might send a notification.

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Tutor application rejected.",
    data: application,
  });
});
