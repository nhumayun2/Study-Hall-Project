import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { TutorApplication } from "../model/tutorApplication.model.js";
import { User } from "../model/user.model.js";

/**
 * @description ADMIN gets a list of all tutor applications, with filtering.
 * @route GET /api/v1/admin/applications/tutors
 * @access Admin
 */
export const getAllTutorApplications = catchAsync(async (req, res) => {
  const { status = "Pending", page = 1, limit = 10 } = req.query; // Default to pending applications
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const query = {};
  if (status) {
    query.status = status;
  }

  const totalApplications = await TutorApplication.countDocuments(query);
  const applications = await TutorApplication.find(query)
    .populate("user", "name email createdAt")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Tutor applications fetched successfully.",
    data: {
      applications,
      total: totalApplications,
      page: parseInt(page),
      totalPages: Math.ceil(totalApplications / limit),
    },
  });
});

/**
 * @description ADMIN gets the details of a single tutor application.
 * @route GET /api/v1/admin/applications/tutors/:applicationId
 * @access Admin
 */
export const getTutorApplicationDetails = catchAsync(async (req, res) => {
  const { applicationId } = req.params;
  const application = await TutorApplication.findById(applicationId).populate(
    "user",
    "name email"
  );

  if (!application) {
    throw new AppError(httpStatus.NOT_FOUND, "Tutor application not found.");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Application details fetched successfully.",
    data: application,
  });
});

/**
 * @description ADMIN approves a tutor application, promoting the user.
 * @route PATCH /api/v1/admin/applications/tutors/:applicationId/approve
 * @access Admin
 */
export const approveTutorApplication = catchAsync(async (req, res) => {
  const { applicationId } = req.params;

  const application = await TutorApplication.findById(applicationId);
  if (!application || application.status !== "Pending") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Application not found or has already been processed."
    );
  }

  const user = await User.findById(application.user);
  if (!user) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "The user associated with this application no longer exists."
    );
  }

  // Update the User document
  user.role = "Tutor";
  user.status = "Active";
  user.tutorProfile = {
    bio: application.bio,
    experience: application.experience,
    educationLevel: application.educationLevel,
    major: application.major,
    categories: application.categoriesToTeach,
    isVerified: true, // Mark as KYC verified upon approval
    rating: 0,
    totalReviews: 0,
  };

  // Update the Application document
  application.status = "Approved";

  // Save both documents
  await user.save({ validateBeforeSave: false });
  await application.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message:
      "Tutor application approved. The user has been promoted to a Tutor.",
    data: application,
  });
});

/**
 * @description ADMIN rejects a tutor application.
 * @route PATCH /api/v1/admin/applications/tutors/:applicationId/reject
 * @access Admin
 */
export const rejectTutorApplication = catchAsync(async (req, res) => {
  const { applicationId } = req.params;
  const { reason } = req.body;

  if (!reason) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "A reason for rejection is required."
    );
  }

  const application = await TutorApplication.findById(applicationId);
  if (!application || application.status !== "Pending") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Application not found or has already been processed."
    );
  }

  application.status = "Rejected";
  application.rejectionReason = reason;
  await application.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Tutor application has been rejected.",
    data: application,
  });
});
