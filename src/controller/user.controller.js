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
  const user = await User.findById(userId).select(
    "-password -refreshToken -verificationToken -passwordResetToken -isVerified"
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
 */
export const updateMyProfile = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { name, dob, tutorProfile, locationOwnerProfile } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found.");
  }

  if (name) user.name = name;
  if (dob) user.dob = dob;

  if (user.role === "Tutor" && tutorProfile) {
    user.tutorProfile = { ...user.tutorProfile, ...tutorProfile };
  }
  if (user.role === "LocationOwner" && locationOwnerProfile) {
    user.locationOwnerProfile = {
      ...user.locationOwnerProfile,
      ...locationOwnerProfile,
    };
  }

  if (req.file) {
    const result = await uploadOnCloudinary(req.file.buffer);
    user.avatar = {
      public_id: result.public_id,
      url: result.secure_url,
    };
  }

  await user.save({ validateBeforeSave: false });

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
// --- NEW: BENEFICIARY & FINANCIAL INFO MANAGEMENT ---
// ====================================================================
/**
 * @description Allows a Tutor or Location Owner to update their payment info.
 */
export const updateBeneficiaryInfo = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { bankName, accountNumber, accountHolder, stripeAccountId } = req.body;

  if (!bankName || !accountNumber || !accountHolder || !stripeAccountId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "All beneficiary fields, including Stripe Account ID, are required."
    );
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found.");
  }

  user.beneficiaryInfo = { bankName, accountNumber, accountHolder };
  user.stripeAccountId = stripeAccountId;

  await user.save({ validateBeforeSave: false });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Beneficiary information updated successfully.",
    data: user,
  });
});

// ====================================================================
// --- MINOR MANAGEMENT CONTROLLERS ---
// ====================================================================
export const addMinor = catchAsync(async (req, res) => {
  const parentId = req.user._id;
  const { name, gender, dob } = req.body;

  if (!name || !dob) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Minor's name and date of birth are required."
    );
  }

  const user = await User.findById(parentId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "Parent user not found.");
  }

  user.minors.push({ name, gender, dob });
  await user.save({ validateBeforeSave: false });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Minor added successfully.",
    data: user.minors[user.minors.length - 1],
  });
});
export const updateMinor = catchAsync(async (req, res) => {
  const parentId = req.user._id;
  const { minorId } = req.params;
  const { name, gender, dob } = req.body;

  const user = await User.findById(parentId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found.");
  }

  const minor = user.minors.id(minorId);
  if (!minor) {
    throw new AppError(httpStatus.NOT_FOUND, "Minor not found for this user.");
  }

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

  user.minors.pull(minorId);
  await user.save({ validateBeforeSave: false });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Minor deleted successfully.",
    data: null,
  });
});
