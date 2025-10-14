import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { Location } from "../model/location.model.js";
import { User } from "../model/user.model.js";
import { Session } from "../model/session.model.js"; // Import the Session model

/**
 * @description ADMIN gets a paginated and filterable list of all locations.
 * @route GET /api/v1/admin/locations
 * @access Admin
 */
export const getAllLocations = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, search, approvalStatus, isActive } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const query = {};

  if (approvalStatus) query.approvalStatus = approvalStatus;
  if (isActive !== undefined) query.isActive = isActive === "true";

  if (search) {
    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ],
    }).select("_id");

    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { address: { $regex: search, $options: "i" } },
      { owner: { $in: matchingUsers.map((user) => user._id) } },
    ];
  }

  const totalLocations = await Location.countDocuments(query);
  const locations = await Location.find(query)
    .populate("owner", "name email")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Locations retrieved successfully for admin panel.",
    data: {
      locations,
      total: totalLocations,
      page: parseInt(page),
      totalPages: Math.ceil(totalLocations / limit),
    },
  });
});

/**
 * @description ADMIN gets detailed information about a single location.
 * @route GET /api/v1/admin/locations/:locationId
 * @access Admin
 */
export const getLocationDetails = catchAsync(async (req, res) => {
  const { locationId } = req.params;
  const location = await Location.findById(locationId).populate(
    "owner",
    "name email"
  );

  if (!location) {
    throw new AppError(httpStatus.NOT_FOUND, "Location not found.");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Location details retrieved successfully.",
    data: location,
  });
});

/**
 * @description ADMIN gets the session history for a specific location.
 * @route GET /api/v1/admin/locations/:locationId/history
 * @access Admin
 */
export const getLocationSessionHistory = catchAsync(async (req, res) => {
  const { locationId } = req.params;
  const { page = 1, limit = 10, status } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const query = { location: locationId };
  if (status) {
    query.status = status;
  }

  const totalSessions = await Session.countDocuments(query);
  const sessions = await Session.find(query)
    .populate("student", "name")
    .populate("tutor", "name")
    .sort({ "schedule.date": -1 })
    .skip(skip)
    .limit(parseInt(limit));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Session history for location fetched successfully.`,
    data: {
      sessions,
      total: totalSessions,
      page: parseInt(page),
      totalPages: Math.ceil(totalSessions / limit),
    },
  });
});

/**
 * @description ADMIN approves a location listing.
 * @route PATCH /api/v1/admin/locations/:locationId/approve
 * @access Admin
 */
export const approveLocation = catchAsync(async (req, res) => {
  const { locationId } = req.params;

  const location = await Location.findById(locationId);
  if (!location || location.approvalStatus !== "Pending") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Location not found or is not pending approval."
    );
  }

  location.approvalStatus = "Approved";
  location.isActive = true; // Automatically activate upon approval
  await location.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Location '${location.name}' has been approved and is now active.`,
    data: location,
  });
});

/**
 * @description ADMIN rejects a location listing.
 * @route PATCH /api/v1/admin/locations/:locationId/reject
 * @access Admin
 */
export const rejectLocation = catchAsync(async (req, res) => {
  const { locationId } = req.params;
  const { reason } = req.body;

  if (!reason) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "A reason for rejection is required."
    );
  }

  const location = await Location.findById(locationId);
  if (!location || location.approvalStatus !== "Pending") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Location not found or is not pending approval."
    );
  }

  location.approvalStatus = "Rejected";
  location.isActive = false;
  location.rejectionReason = reason;
  await location.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Location '${location.name}' has been rejected.`,
    data: location,
  });
});

/**
 * @description ADMIN toggles the active status of an already approved location.
 * @route PATCH /api/v1/admin/locations/:locationId/toggle-active
 * @access Admin
 */
export const toggleLocationActiveStatus = catchAsync(async (req, res) => {
  const { locationId } = req.params;

  const location = await Location.findById(locationId);
  if (!location || location.approvalStatus !== "Approved") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Location not found or has not been approved yet."
    );
  }

  location.isActive = !location.isActive;
  await location.save();

  const action = location.isActive ? "activated" : "deactivated";
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Location has been successfully ${action}.`,
    data: location,
  });
});
