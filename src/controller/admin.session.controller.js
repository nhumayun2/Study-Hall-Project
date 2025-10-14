import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { Session } from "../model/session.model.js";
import { User } from "../model/user.model.js";
import { Review } from "../model/review.model.js"; // Import the Review model

/**
 * @description ADMIN gets a paginated and filterable list of all sessions.
 * @route GET /api/v1/admin/sessions
 * @access Admin
 */
export const getAllSessions = catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    status,
    search,
    paymentStatus,
    isBlocked,
  } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const query = {};

  if (status) query.status = status;
  if (isBlocked !== undefined) query.isBlocked = isBlocked === "true";
  if (paymentStatus) query.paymentStatus = paymentStatus;

  if (search) {
    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ],
    }).select("_id");
    const userIds = matchingUsers.map((user) => user._id);

    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { creator: { $in: userIds } },
      { acceptedTutor: { $in: userIds } },
    ];
  }

  const totalSessions = await Session.countDocuments(query);
  const sessions = await Session.find(query)
    .populate("creator", "name email")
    .populate("acceptedTutor", "name email")
    .sort({ "schedule.date": -1 })
    .skip(skip)
    .limit(parseInt(limit));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Sessions retrieved successfully for admin panel.",
    data: {
      sessions,
      total: totalSessions,
      page: parseInt(page),
      totalPages: Math.ceil(totalSessions / limit),
    },
  });
});

/**
 * @description ADMIN gets detailed information about a single session.
 * @route GET /api/v1/admin/sessions/:sessionId
 * @access Admin
 */
export const getSessionDetails = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const session = await Session.findById(sessionId).populate([
    { path: "creator", select: "name email" },
    { path: "acceptedTutor", select: "name email" },
    { path: "location", select: "name address" },
    { path: "cancellationDetails.cancelledBy", select: "name role" },
  ]);

  if (!session) {
    throw new AppError(httpStatus.NOT_FOUND, "Session not found.");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Session details retrieved successfully.",
    data: session,
  });
});

/**
 * @description ADMIN manually updates the status of a session.
 * @route PATCH /api/v1/admin/sessions/:sessionId/status
 * @access Admin
 */
export const updateSessionStatus = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const { status, reason } = req.body;

  const validStatuses = [
    "Pending",
    "Active",
    "AwaitingTutorSelection",
    "Booked",
    "Ongoing",
    "Completed",
    "Cancelled",
    "Blocked",
  ];
  if (!status || !validStatuses.includes(status)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Invalid status. Must be one of: ${validStatuses.join(", ")}.`
    );
  }

  const session = await Session.findById(sessionId);
  if (!session) {
    throw new AppError(httpStatus.NOT_FOUND, "Session not found.");
  }

  session.status = status;
  if (status === "Cancelled") {
    session.cancellationDetails = {
      cancelledBy: req.user._id,
      reason: reason || "Cancelled by administrator.",
      timestamp: new Date(),
    };
    // TODO: Add logic to release payment intent if session is cancelled by admin
  }

  await session.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Session status successfully updated to '${status}'.`,
    data: session,
  });
});

/**
 * @description ADMIN blocks or unblocks a session.
 * @route PATCH /api/v1/admin/sessions/:sessionId/block
 * @access Admin
 */
export const toggleSessionBlockStatus = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const { isBlocked, reason } = req.body;

  if (typeof isBlocked !== "boolean") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "A boolean value for 'isBlocked' is required."
    );
  }
  if (isBlocked && !reason) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "A reason is required to block a session."
    );
  }

  const updateData = {
    isBlocked,
    blockReason: isBlocked ? reason : null,
  };

  const session = await Session.findByIdAndUpdate(sessionId, updateData, {
    new: true,
  });

  if (!session) {
    throw new AppError(httpStatus.NOT_FOUND, "Session not found.");
  }

  const action = isBlocked ? "blocked" : "unblocked";
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Session has been successfully ${action}.`,
    data: session,
  });
});

/**
 * @description ADMIN gets all reviews associated with a specific session.
 * @route GET /api/v1/admin/sessions/:sessionId/reviews
 * @access Admin
 */
export const getSessionReviews = catchAsync(async (req, res) => {
  const { sessionId } = req.params;

  const reviews = await Review.find({ sessionId }).populate(
    "reviewer",
    "name avatar"
  );

  if (!reviews) {
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "No reviews found for this session yet.",
      data: { tutorReviews: [], locationReviews: [] },
    });
  }

  // Group reviews by the type of subject being reviewed
  const tutorReviews = reviews.filter((r) => r.reviewSubjectModel === "User");
  const locationReviews = reviews.filter(
    (r) => r.reviewSubjectModel === "Location"
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Session reviews fetched successfully.",
    data: {
      tutorReviews,
      locationReviews,
    },
  });
});
