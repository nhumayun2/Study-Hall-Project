import AppError from "../errors/AppError.js";
import httpStatus from "http-status";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { Minor } from "./../model/minor.model.js";

// Utility to create a new minor (used during registration and post-registration)
export const createMinor = catchAsync(async (req, res) => {
  // Use req.user._id as the parent ID (must be authenticated)
  const parentId = req.user._id;
  const { name, gender, dob } = req.body;

  if (!name || !dob) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Minor's name and date of birth are required."
    );
  }

  // Note: Mongoose will validate 'gender' against the enum.
  const newMinor = await Minor.create({
    parent: parentId,
    name,
    gender,
    dob,
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Minor added successfully",
    data: newMinor,
  });
});

// Utility to get all minors for the authenticated parent
export const getMyMinors = catchAsync(async (req, res) => {
  const parentId = req.user._id;
  const minors = await Minor.find({ parent: parentId });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Minors retrieved successfully",
    data: minors,
  });
});

// Utility to update a specific minor
export const updateMinor = catchAsync(async (req, res) => {
  const minorId = req.params.minorId;
  const parentId = req.user._id;
  const updateData = req.body; // Contains name, gender, dob

  const updatedMinor = await Minor.findOneAndUpdate(
    { _id: minorId, parent: parentId }, // Ensure the minor belongs to the parent
    updateData,
    { new: true, runValidators: true }
  );

  if (!updatedMinor) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Minor not found or does not belong to this user."
    );
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Minor updated successfully",
    data: updatedMinor,
  });
});

// Utility to delete a specific minor
export const deleteMinor = catchAsync(async (req, res) => {
  const minorId = req.params.minorId;
  const parentId = req.user._id;

  const deletedMinor = await Minor.findOneAndDelete({
    _id: minorId,
    parent: parentId,
  });

  if (!deletedMinor) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Minor not found or does not belong to this user."
    );
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Minor deleted successfully",
    data: null,
  });
});
