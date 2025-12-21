import httpStatus from "http-status";
import { User } from "../model/user.model.js";
import { Session } from "../model/session.model.js"; // <-- THIS IS THE FIX
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";

/**
 * @description Get the profile of the currently authenticated user.
 */
export const getMyProfile = catchAsync(async (req, res) => {
  const userId = req.user._id;
  // Make sure to select stripeAccountId as it's needed by the user
  const user = await User.findById(userId).select("+stripeAccountId");

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
// --- BENEFICIARY & FINANCIAL INFO MANAGEMENT ---
// ====================================================================
/**
 * @description Allows a Tutor or Location Owner to update their payment info.
 */
export const updateBeneficiaryInfo = catchAsync(async (req, res) => {
  const userId = req.user._id;
  // We no longer need to get stripeAccountId from here, as it's handled by onboarding
  const { bankName, accountNumber, accountHolder } = req.body;

  if (!bankName || !accountNumber || !accountHolder) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "All beneficiary fields are required."
    );
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found.");
  }

  user.beneficiaryInfo = { bankName, accountNumber, accountHolder };

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

// ====================================================================
// --- NEW: PUBLIC TUTOR PROFILE ---
// ====================================================================
/**
 * @description (NEW) Get a tutor's public-facing profile information.
 * @route GET /api/v1/users/tutor/:tutorId
 * @access Public
 */
export const getTutorPublicProfile = catchAsync(async (req, res) => {
  const { tutorId } = req.params;

  const tutor = await User.findOne({ _id: tutorId, role: "Tutor" }).select(
    "name avatar tutorProfile" // Only select public-safe information
  );

  if (!tutor) {
    throw new AppError(httpStatus.NOT_FOUND, "Tutor not found.");
  }

  // We can also add student count here, as shown in Figma
  const studentCount = await Session.countDocuments({
    acceptedTutor: tutorId,
    status: "Completed", // or 'Booked' depending on business logic
  });

  // Combine profile data with dynamic stats
  const publicProfile = {
    ...tutor.toObject(),
    studentCount: studentCount,
  };

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Tutor profile fetched successfully.",
    data: publicProfile,
  });
});

// ====================================================================
// --- (NEW) PUBLIC TUTOR LIST ---
// ====================================================================
/**
 * @description (NEW) Get a list of all active tutors with search and pagination.
 * @route GET /api/v1/users/tutors
 * @access Public
 */
export const getAllActiveTutors = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, search } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const query = {
    role: "Tutor",
    status: "Active",
    "tutorProfile.isVerified": true,
  };

  // Add search functionality
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { "tutorProfile.major": { $regex: search, $options: "i" } },
      { "tutorProfile.bio": { $regex: search, $options: "i" } },
    ];
  }

  const totalTutors = await User.countDocuments(query);
  const tutors = await User.find(query)
    .select("name avatar tutorProfile.rating tutorProfile.bio") // Select only public-facing fields
    .sort({ "tutorProfile.rating": -1 }) // Sort by highest rating first
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Active tutors fetched successfully.",
    data: {
      tutors,
      total: totalTutors,
      page: parseInt(page),
      totalPages: Math.ceil(totalTutors / limit),
    },
  });
});
