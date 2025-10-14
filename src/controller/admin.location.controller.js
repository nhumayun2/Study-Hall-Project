import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import AppError from "../errors/AppError.js";
import { Location } from "../model/location.model.js";
import { User } from "../model/user.model.js"; // To populate the owner info

/**
 * @desc Admin: Get all locations with filtering, searching, and pagination
 * @route GET /api/v1/admin/locations
 * @access Admin
 * Used for the main 'Locations' review/management list.
 */
export const getAllLocationsAdmin = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, search, approvalStatus, isActive } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const query = {}; // Filter by Approval Status (e.g., Pending, Approved, Rejected)

  if (approvalStatus) {
    const validStatuses = ["Pending", "Approved", "Rejected"];
    if (!validStatuses.includes(approvalStatus)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Invalid approvalStatus filter provided."
      );
    }
    query.approvalStatus = approvalStatus;
  } // Filter by Active/Deactivated Status
  if (isActive !== undefined) {
    query.isActive = isActive === "true";
  } else {
    // Default: Only show locations that are either pending review or currently active/approved
    query.$or = [{ approvalStatus: { $ne: "Rejected" } }, { isActive: true }];
  } // Search filter (by Location Name or Owner Email/Name)

  if (search) {
    // Search by Location Name
    query.$or = [{ name: { $regex: search, $options: "i" } }]; // Add search by owner if User model is linked (assuming location is linked to an owner/user)
    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ],
    }).select("_id");
    if (matchingUsers.length > 0) {
      query.$or.push({ owner: { $in: matchingUsers.map((user) => user._id) } });
    }
  }

  const totalLocations = await Location.countDocuments(query);
  const locations = await Location.find(query)
    .populate("owner", "name email phone")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit)); // Format data for admin dashboard table view

  const formattedLocations = locations.map((location) => ({
    id: location._id,
    name: location.name,
    city: location.city || "N/A",
    submittedBy: location.owner ? location.owner.name : "N/A",
    submissionDate: location.createdAt.toISOString().split("T")[0],
    approvalStatus: location.approvalStatus,
    isActive: location.isActive,
  }));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Locations retrieved successfully for Admin Panel.",
    data: {
      locations: formattedLocations,
      total: totalLocations,
      page: parseInt(page),
      limit: parseInt(limit),
    },
  });
});

/**
 * @desc Admin: Get detailed information about a single location
 * @route GET /api/v1/admin/locations/:locationId
 * @access Admin
 * Used for the 'Review/Details' page of a location.
 */
export const getLocationDetailsAdmin = catchAsync(async (req, res) => {
  const { locationId } = req.params;

  const location = await Location.findById(locationId)
    .populate("owner", "name email phone")
    .lean();

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
 * @desc Admin: Approve a submitted location
 * @route PATCH /api/v1/admin/locations/:locationId/approve
 * @access Admin
 */
export const approveLocationAdmin = catchAsync(async (req, res) => {
  const { locationId } = req.params;
  const location = await Location.findByIdAndUpdate(
    locationId,
    {
      approvalStatus: "Approved",
      isActive: true, // Auto-activate upon approval
      approvedBy: req.user._id,
      approvedAt: new Date(),
      rejectionReason: null,
    },
    { new: true }
  );

  if (!location) {
    throw new AppError(httpStatus.NOT_FOUND, "Location not found.");
  } // OPTIONAL: Update the owner's role or status if needed (e.g., if approval triggers a change) // await User.findByIdAndUpdate(location.owner, { /* update fields */ });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Location '${location.name}' has been approved and activated.`,
    data: location,
  });
});

/**
 * @desc Admin: Reject a submitted location
 * @route PATCH /api/v1/admin/locations/:locationId/reject
 * @access Admin
 */
export const rejectLocationAdmin = catchAsync(async (req, res) => {
  const { locationId } = req.params;
  const { rejectionReason } = req.body;
  if (!rejectionReason || rejectionReason.trim().length < 10) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "A detailed rejection reason (min 10 characters) is required."
    );
  }

  const location = await Location.findByIdAndUpdate(
    locationId,
    {
      approvalStatus: "Rejected",
      isActive: false, // Ensure rejected locations are inactive
      rejectionReason: rejectionReason,
      approvedBy: null,
      approvedAt: null,
    },
    { new: true }
  );

  if (!location) {
    throw new AppError(httpStatus.NOT_FOUND, "Location not found.");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Location '${location.name}' has been rejected.`,
    data: location,
  });
});

/**
 * @desc Admin: Toggle the active status of an approved location (Deactivate/Reactivate)
 * @route PATCH /api/v1/admin/locations/:locationId/toggle-active
 * @access Admin
 */
export const toggleLocationActiveStatusAdmin = catchAsync(async (req, res) => {
  const { locationId } = req.params;
  const { isActive } = req.body;
  if (typeof isActive !== "boolean") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "A boolean value for 'isActive' is required."
    );
  }

  const location = await Location.findByIdAndUpdate(
    locationId,
    { isActive: isActive },
    { new: true, select: "name address isActive approvalStatus" }
  );

  if (!location) {
    throw new AppError(httpStatus.NOT_FOUND, "Location not found.");
  }

  const action = isActive ? "activated" : "deactivated";
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Location '${location.name}' has been ${action}.`,
    data: {
      locationId: location._id,
      isActive: location.isActive,
      status: location.approvalStatus,
    },
  });
});
