import httpStatus from "http-status";
import { User } from "../model/user.model.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";

/**
 * @description Get the profile of the currently authenticated user.
 */
export const getMyProfile = catchAsync(async (req, res) => {
  const userId = req.user._id;

  // The User model is now unified, so we fetch directly from it.
  const user = await User.findById(userId).select(
    "-password -refreshToken -verificationInfo -passwordResetToken"
  );

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User profile not found.");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile fetched successfully.",
    data: user,
  });
});

/**
 * @description Update the profile of the currently authenticated user.
 * Handles general info, role-specific profiles, and avatar uploads.
 */
export const updateMyProfile = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { name, dob, tutorProfile, locationOwnerProfile } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found.");
  }

  // --- 1. Update general user information ---
  if (name) user.name = name;
  if (dob) user.dob = dob;

  // --- 2. Update role-specific profiles (if the user has the role) ---
  if (user.role === "Tutor" && tutorProfile) {
    // Merge updates into the existing tutorProfile to avoid overwriting.
    user.tutorProfile = { ...user.tutorProfile, ...tutorProfile };
  }
  if (user.role === "LocationOwner" && locationOwnerProfile) {
    user.locationOwnerProfile = { ...user.locationOwnerProfile, ...locationOwnerProfile };
  }

  // --- 3. Handle avatar upload ---
  if (req.file) {
    const result = await uploadOnCloudinary(req.file.buffer);
    user.avatar = {
      public_id: result.public_id,
      url: result.secure_url,
    };
  }

  await user.save({ validateBeforeSave: false }); // Bypass validation for partial updates

  const updatedUser = user.toObject();
  delete updatedUser.password;
  delete updatedUser.refreshToken;

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile updated successfully.",
    data: updatedUser,
  });
});

// ====================================================================
// --- MINOR MANAGEMENT CONTROLLERS (Formerly in minor.controller.js) ---
// ====================================================================

/**
 * @description Add a new minor to the authenticated user's profile.
 */
export const addMinor = catchAsync(async (req, res) => {
  const parentId = req.user._id;
  const { name, gender, dob } = req.body;

  if (!name || !dob) {
    throw new AppError(httpStatus.BAD_REQUEST, "Minor's name and date of birth are required.");
  }

  const user = await User.findById(parentId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "Parent user not found.");
  }

  // Add the new minor to the embedded array. Mongoose handles the validation.
  user.minors.push({ name, gender, dob });
  await user.save({ validateBeforeSave: false });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Minor added successfully.",
    data: user.minors[user.minors.length - 1], // Return the newly added minor
  });
});

/**
 * @description Update an existing minor's details.
 */
export const updateMinor = catchAsync(async (req, res) => {
  const parentId = req.user._id;
  const { minorId } = req.params;
  const { name, gender, dob } = req.body;

  const user = await User.findById(parentId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found.");
  }

  // Find the specific minor in the array by its _id
  const minor = user.minors.id(minorId);
  if (!minor) {
    throw new AppError(httpStatus.NOT_FOUND, "Minor not found for this user.");
  }

  // Update fields
  if (name) minor.name = name;
  if (gender) minor.gender = gender;
  if (dob) minor.dob = dob;

  await user.save({ validateBeforeSave: false });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Minor updated successfully.",
    data: minor,
  });
});

/**
 * @description Delete a minor from the user's profile.
 */
export const deleteMinor = catchAsync(async (req, res) => {
  const parentId = req.user._id;
  const { minorId } = req.params;

  const user = await User.findById(parentId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found.");
  }

  const minor = user.minors.id(minorId);
  if (!minor) {
    throw new AppError(httpStatus.NOT_FOUND, "Minor not found for this user.");
  }

  // Mongoose's pull method is perfect for removing items from an array
  minor.remove();
  
  await user.save({ validateBeforeSave: false });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Minor deleted successfully.",
    data: null,
  });
});
