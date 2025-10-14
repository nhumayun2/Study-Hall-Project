import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import AppError from "../errors/AppError.js";
import { Session } from "../model/session.model.js";
import { User } from "../model/user.model.js";
import { Review } from "../model/review.model.js"; // Assuming a Review model exists

// Utility to format date for cleaner output
const formatDate = (date) => new Date(date).toLocaleString();

/**
 * @desc Admin: Get all sessions with filtering, searching, and pagination
 * @route GET /api/v1/admin/sessions
 * @access Admin
 * Used for the main 'Sessions' tab list view in Admin Panel.
 */
export const getAllSessionsAdmin = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    status,
    search,
    paymentStatus,
    isBlocked,
  } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const query = {}; // Filter by status (Scheduled, Ongoing, Completed, Cancelled, Dispute)

  if (status) {
    query.status = status;
  } // Filter by block status (Assumes 'isBlocked' field exists on Session Model)
  if (isBlocked !== undefined) {
    query.isBlocked = isBlocked === "true";
  } // Filter by payment status (Paid, Unpaid, Refunded, Failed)

  if (paymentStatus) {
    query.paymentStatus = paymentStatus;
  } // Search filter (Search by Student/Tutor Name or Email)
  if (search) {
    // Find users whose name or email matches the search term
    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ],
    }).select("_id");
    const userIds = matchingUsers.map((user) => user._id); // Apply search to both student and tutor fields
    query.$or = [
      ...(query.$or || []),
      { student: { $in: userIds } },
      { tutor: { $in: userIds } },
    ];
  }

  const totalSessions = await Session.countDocuments(query);
  const sessions = await Session.find(query)
    .populate("student", "name email")
    .populate("tutor", "name email")
    .populate("course", "title")
    .sort({ startTime: -1, createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit)); // Format data for admin dashboard table view

  const formattedSessions = sessions.map((session) => ({
    id: session._id,
    student: session.student?.name || "N/A",
    tutor: session.tutor?.name || "N/A",
    course: session.course?.title || "N/A",
    date: formatDate(session.startTime),
    duration: `${session.durationMinutes} min`,
    price: session.price,
    status: session.status,
    isBlocked: session.isBlocked || false,
    paymentStatus: session.paymentStatus,
  }));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Sessions retrieved successfully for Admin Panel",
    data: {
      sessions: formattedSessions,
      total: totalSessions,
      page: parseInt(page),
      limit: parseInt(limit),
    },
  });
});

/**
 * @desc Admin: Get detailed session information
 * @route GET /api/v1/admin/sessions/:sessionId
 * @access Admin
 */
export const getSessionDetailsAdmin = catchAsync(async (req, res) => {
  const { sessionId } = req.params;

  const session = await Session.findById(sessionId)
    .populate("student", "name email phone")
    .populate("tutor", "name email phone")
    .populate("course", "title")
    .populate("location", "name address")
    .populate("cancelledBy", "name role");
  //.populate("blockedBy", "name role");

  if (!session) {
    throw new AppError(httpStatus.NOT_FOUND, "Session not found");
  } // Format detailed response for the admin view
  const formattedDetails = {
    sessionId: session._id,
    status: session.status,
    isBlocked: session.isBlocked || false,
    paymentStatus: session.paymentStatus,
    startTime: formatDate(session.startTime),
    endTime: formatDate(session.endTime),
    duration: `${session.durationMinutes} minutes`,
    course: session.course?.title || "N/A",
    location: session.location
      ? `${session.location.name} (${session.location.address})`
      : "Online",
    isPrivate: session.isPrivate,
    progress: session.progress,
    student: {
      name: session.student?.name || "N/A",
      email: session.student?.email || "N/A",
      phone: session.student?.phone || "N/A",
    },
    tutor: {
      name: session.tutor?.name || "N/A",
      email: session.tutor?.email || "N/A",
      phone: session.tutor?.phone || "N/A",
    },
    financial: {
      price: session.price,
      commissionRate: (session.commissionRate * 100).toFixed(0) + "%",
      adminCommission: session.adminCommission,
      tutorEarnings: session.tutorEarnings,
    },
    cancellation:
      session.status === "Cancelled"
        ? {
            reason: session.cancellationReason,
            details: session.cancellationDetails,
            cancelledBy: session.cancelledBy
              ? session.cancelledBy.name
              : "Unknown",
          }
        : null,
    blocking: session.isBlocked
      ? {
          reason: session.blockReason,
          blockedBy: session.blockedBy ? session.blockedBy.name : "Unknown",
          blockedAt: formatDate(session.blockedAt),
        }
      : null,

    timestamps: {
      created: formatDate(session.createdAt),
      lastUpdated: formatDate(session.updatedAt),
    },
  };

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Session details retrieved successfully",
    data: formattedDetails,
  });
});

/**
 * @desc Admin: Manually update session status or resolve dispute
 * @route PATCH /api/v1/admin/sessions/:sessionId/status
 * @access Admin
 */
export const updateSessionStatusAdmin = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const { status, paymentStatus, cancellationReason } = req.body;

  if (!status && !paymentStatus) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Must provide a new status or paymentStatus."
    );
  }

  const updateData = {};
  if (status) {
    const validStatuses = [
      "Scheduled",
      "Ongoing",
      "Completed",
      "Cancelled",
      "Dispute",
    ];
    if (!validStatuses.includes(status)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid status provided.");
    }
    updateData.status = status;

    if (status === "Cancelled") {
      updateData.cancellationReason =
        cancellationReason || "Cancelled by Administrator";
      updateData.cancelledBy = req.user._id;
      if (!paymentStatus) updateData.paymentStatus = "Refunded";
    }
  }

  if (paymentStatus) {
    const validPaymentStatuses = ["Paid", "Unpaid", "Refunded", "Failed"];
    if (!validPaymentStatuses.includes(paymentStatus)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Invalid payment status provided."
      );
    }
    updateData.paymentStatus = paymentStatus;
  }
  const updatedSession = await Session.findByIdAndUpdate(
    sessionId,
    updateData,
    { new: true, runValidators: true }
  );

  if (!updatedSession) {
    throw new AppError(httpStatus.NOT_FOUND, "Session not found.");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Session updated successfully. New Status: ${updatedSession.status}, New Payment Status: ${updatedSession.paymentStatus}`,
    data: updatedSession,
  });
});

/**
 * @desc Admin: Block or Unblock a session
 * @route PATCH /api/v1/admin/sessions/:sessionId/block
 * @access Admin
 * NOTE: Assumes your Session Model has 'isBlocked', 'blockReason', 'blockedBy', 'blockedAt' fields
 */
export const toggleSessionBlockStatusAdmin = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const { isBlocked, reason } = req.body;
  const adminId = req.user._id;
  if (isBlocked === undefined || typeof isBlocked !== "boolean") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "A boolean value for 'isBlocked' is required."
    );
  }

  if (isBlocked && (!reason || reason.trim().length < 10)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "A detailed reason (min 10 characters) is required to block a session."
    );
  }

  const updateData = isBlocked
    ? {
        isBlocked: true,
        blockReason: reason,
        blockedBy: adminId,
        blockedAt: new Date(),
      }
    : {
        isBlocked: false,
        blockReason: null,
        blockedBy: null,
        blockedAt: null,
      };

  const session = await Session.findByIdAndUpdate(sessionId, updateData, {
    new: true,
  })
  .populate()

  if (!session) {
    throw new AppError(httpStatus.NOT_FOUND, "Session not found.");
  }

  const action = isBlocked ? "blocked" : "unblocked";
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Session ${session._id} has been ${action}.`,
    data: session,
  });
});

/**
 * @desc Admin: Get all associated reviews (Student, Tutor, Location) for a specific session
 * @route GET /api/v1/admin/sessions/:sessionId/reviews
 * @access Admin
 * Note: Assumes Review Model has 'session' and 'type' fields (e.g., 'student', 'tutor', 'location')
 */
export const getSessionReviewsAdmin = catchAsync(async (req, res) => {
  const { sessionId } = req.params;

  const sessionExists = await Session.findById(sessionId);
  if (!sessionExists) {
    throw new AppError(httpStatus.NOT_FOUND, "Session not found.");
  } // Fetch all reviews related to this session

  const reviews = await Review.find({ session: sessionId })
    .populate("user", "name role") // The user who wrote the review (e.g., Student or Tutor)
    .populate("targetUser", "name role") // The user the review targets (e.g., Tutor or Student)
    .populate("targetLocation", "name") // If the review targets a location
    .sort({ createdAt: -1 }); // Group and format reviews for the admin interface

  const groupedReviews = {
    studentReviews: [],
    tutorReviews: [],
    locationReviews: [],
  };

  reviews.forEach((review) => {
    const formattedReview = {
      reviewId: review._id,
      rating: review.rating,
      comment: review.comment,
      createdBy: review.user?.name || "Anonymous",
      createdByRole: review.user?.role || "N/A",
      target: review.targetUser?.name || review.targetLocation?.name || "N/A",
      createdAt: formatDate(review.createdAt),
    }; // Classify review based on its intended target/type (requires a 'type' field in the Review model)

    if (review.type === "tutor") {
      groupedReviews.tutorReviews.push(formattedReview);
    } else if (review.type === "student") {
      groupedReviews.studentReviews.push(formattedReview);
    } else if (review.type === "location") {
      groupedReviews.locationReviews.push(formattedReview);
    }
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Session-related reviews retrieved successfully.",
    data: groupedReviews,
  });
});
