import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { Location } from "../model/location.model.js";
import { User } from "../model/user.model.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";

// ====================================================================
// --- LOCATION OWNER: MANAGING THEIR OWN LOCATIONS ---
// ====================================================================

/**
 * @description LOCATION OWNER creates a new location listing.
 * @route POST /api/v1/locations
 * @access LocationOwner
 */
export const createLocation = catchAsync(async (req, res) => {
  const ownerId = req.user._id;
  const {
    name,
    address,
    description,
    rules,
    noiseLevel,
    maxCapacity,
    type,
    coordinates,
  } = req.body;

  if (!name || !address || !maxCapacity || !type) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Name, address, type, and max capacity are required."
    );
  }

  let photos = [];
  // CORRECTED: This now correctly handles the 'req.files' array from upload.array()
  if (req.files && Array.isArray(req.files)) {
    photos = await Promise.all(
      req.files.map(async (file) => {
        const result = await uploadOnCloudinary(file.buffer);
        return { public_id: result.public_id, url: result.secure_url };
      })
    );
  }

  const newLocation = await Location.create({
    owner: ownerId,
    name,
    address,
    description,
    rules,
    noiseLevel,
    maxCapacity,
    type,
    coordinates,
    photos,
    approvalStatus: "Pending", // All new locations must be approved by an admin
    isActive: false,
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Location created successfully. It is now pending admin review.",
    data: newLocation,
  });
});

/**
 * @description LOCATION OWNER updates one of their existing locations.
 * @route PATCH /api/v1/locations/:locationId
 * @access LocationOwner
 */
export const updateMyLocation = catchAsync(async (req, res) => {
  const ownerId = req.user._id;
  const { locationId } = req.params;
  const updates = req.body;

  const location = await Location.findOne({ _id: locationId, owner: ownerId });
  if (!location) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Location not found or you are not the owner."
    );
  }

  // Update fields
  Object.assign(location, updates);

  // Invalidate approval if significant details are changed
  if (updates.name || updates.address || updates.type) {
    location.approvalStatus = "Pending";
    location.isActive = false;
  }

  await location.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Location updated successfully. It may require re-approval.",
    data: location,
  });
});

/**
 * @description LOCATION OWNER gets a list of all their locations.
 * @route GET /api/v1/locations/my-locations
 * @access LocationOwner
 */
export const getMyLocations = catchAsync(async (req, res) => {
  const ownerId = req.user._id;
  const locations = await Location.find({ owner: ownerId });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Your locations have been fetched successfully.",
    data: locations,
  });
});

// ====================================================================
// --- PUBLIC: VIEWING LOCATIONS ---
// ====================================================================

/**
 * @description ANY USER can get a list of all approved and active locations.
 * @route GET /api/v1/locations
 * @access Public
 */
export const getAllLocations = catchAsync(async (req, res) => {
  const { searchTerm, noiseLevel, minCapacity } = req.query;
  const query = {
    approvalStatus: "Approved",
    isActive: true,
  };

  if (searchTerm) {
    query.$or = [
      { name: { $regex: searchTerm, $options: "i" } },
      { address: { $regex: searchTerm, $options: "i" } },
    ];
  }
  if (noiseLevel) {
    query.noiseLevel = noiseLevel;
  }
  if (minCapacity) {
    query.maxCapacity = { $gte: parseInt(minCapacity) };
  }

  const locations = await Location.find(query).populate("owner", "name avatar");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Available locations fetched successfully.",
    data: locations,
  });
});

/**
 * @description ANY USER can get the details of a single location.
 * @route GET /api/v1/locations/:locationId
 * @access Public
 */
export const getLocationDetails = catchAsync(async (req, res) => {
  const { locationId } = req.params;
  const location = await Location.findOne({
    _id: locationId,
    approvalStatus: "Approved",
    isActive: true,
  }).populate("owner", "name avatar");

  if (!location) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Location not found or is not currently active."
    );
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Location details fetched successfully.",
    data: location,
  });
});
