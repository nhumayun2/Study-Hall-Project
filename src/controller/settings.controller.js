import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import AppError from "../errors/AppError.js";
import { Settings } from "../model/settings.model.js";

/**
 * @desc Admin: Get all application settings
 * @route GET /api/v1/admin/settings
 * @access Admin
 */
export const getSettingsAdmin = catchAsync(async (req, res) => {
  // Uses the static method to retrieve or create the single config document
  const settings = await Settings.getSettings();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Application settings fetched successfully",
    data: settings,
  });
});

/**
 * @desc Admin: Update application settings (partial update)
 * @route PATCH /api/v1/admin/settings
 * @access Admin
 */
export const updateSettingsAdmin = catchAsync(async (req, res) => {
  const updateData = req.body;
  if (Object.keys(updateData).length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, "No update data provided.");
  } // Use findOneAndUpdate on the unique key to safely update the single document

  const updatedSettings = await Settings.findOneAndUpdate(
    { key: "GLOBAL_CONFIG" },
    { $set: updateData },
    { new: true, runValidators: true } // Return the updated document and run validation
  );

  if (!updatedSettings) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to update settings configuration."
    );
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Application settings updated successfully",
    data: updatedSettings,
  });
});
