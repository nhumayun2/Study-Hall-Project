import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { TutorAvailability } from "../model/tutorAvailability.model.js";
import { User } from "../model/user.model.js";

/**
 * @description TUTOR sets or updates their weekly and custom availability.
 * @route PUT /api/v1/tutors/availability
 * @access Tutor
 */
export const setMyAvailability = catchAsync(async (req, res) => {
  const tutorId = req.user._id;
  const { defaultAvailability, customOverrides } = req.body;

  // Use findOneAndUpdate with 'upsert: true' to either update an existing document or create a new one.
  // This is the most efficient way to handle this operation.
  const updatedAvailability = await TutorAvailability.findOneAndUpdate(
    { tutor: tutorId },
    {
      $set: {
        defaultAvailability,
        customOverrides,
        lastUpdated: new Date(),
      },
    },
    { new: true, upsert: true, runValidators: true }
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Your availability has been updated successfully.",
    data: updatedAvailability,
  });
});

/**
 * @description ANY USER gets the availability for a specific tutor.
 * @route GET /api/v1/tutors/:tutorId/availability
 * @access Public
 */
export const getTutorAvailability = catchAsync(async (req, res) => {
  const { tutorId } = req.params;

  // Verify the user exists and is actually a tutor
  const tutor = await User.findOne({ _id: tutorId, role: "Tutor" });
  if (!tutor) {
    throw new AppError(httpStatus.NOT_FOUND, "Tutor not found.");
  }

  const availability = await TutorAvailability.findOne({ tutor: tutorId });

  if (!availability) {
    // If a tutor has never set their availability, return a default empty state
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Tutor has not set their availability yet.",
      data: {
        defaultAvailability: [],
        customOverrides: [],
      },
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Tutor availability fetched successfully.",
    data: availability,
  });
});
