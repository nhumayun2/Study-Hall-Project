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
  // UPDATED: Expect address and location as JSON strings
  let {
    name,
    address,
    rules,
    location,
    description,
    noiseLevel,
    maxCapacity,
    type,
  } = req.body;

  // --- PARSE JSON STRINGS ---
  // This is a robust way to handle complex objects alongside file uploads.
  try {
    if (address) address = JSON.parse(address);
    if (location) location = JSON.parse(location);
  } catch (error) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Invalid JSON format for address or location data."
    );
  }

  if (
    !name ||
    !address ||
    !address.street ||
    !address.city ||
    !address.state ||
    !maxCapacity ||
    !type
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Name, full address (street, city, state), type, and max capacity are required."
    );
  }

  let photos = [];
  if (req.files && req.files.photos) {
    photos = await Promise.all(
      req.files.photos.map(async (file) => {
        const result = await uploadOnCloudinary(file.buffer);
        return { public_id: result.public_id, url: result.secure_url };
      })
    );
  }

  const newLocation = await Location.create({
    owner: ownerId,
    name,
    address,
    rules,
    location,
    description,
    noiseLevel,
    maxCapacity,
    type,
    photos,
    approvalStatus: "Pending",
    isActive: false,
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Location created successfully. It is now pending admin review.",
    data: newLocation,
  });
});

// The rest of the controller functions remain the same...

/**
 * @description LOCATION OWNER updates one of their existing locations.
 */
export const updateMyLocation = catchAsync(async (req, res) => {
  const ownerId = req.user._id;
  const { locationId } = req.params;
  const updates = req.body;

  // Also parse JSON strings for updates
  if (updates.address) updates.address = JSON.parse(updates.address);
  if (updates.location) updates.location = JSON.parse(updates.location);

  const location = await Location.findOne({ _id: locationId, owner: ownerId });
  if (!location) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Location not found or you are not the owner."
    );
  }

  Object.assign(location, updates);

  if (updates.address) {
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

/**
 * @description ANY USER can get a list of all approved and active locations, with search.
 */
export const getAllLocations = catchAsync(async (req, res) => {
  const { searchTerm, city, state, noiseLevel, minCapacity } = req.query;
  const query = {
    approvalStatus: "Approved",
    isActive: true,
  };

  if (searchTerm) {
    query.name = { $regex: searchTerm, $options: "i" };
  }
  if (city) {
    query["address.city"] = { $regex: `^${city}$`, $options: "i" };
  }
  if (state) {
    query["address.state"] = { $regex: `^${state}$`, $options: "i" };
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
