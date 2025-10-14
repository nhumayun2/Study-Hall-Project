import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import AppError from "../errors/AppError.js";
import { Notification } from "../model/notification.model.js";
import { User } from "../model/user.model.js";

// Internal function to create a single notification (moved from user controller)
const createSingleNotification = async (recipientId, type, title, message) => {
  const notification = new Notification({
    recipient: recipientId,
    type,
    title,
    message, // relatedId and onModel are omitted for general admin system messages
  });
  return notification.save();
};

/**
 * @desc Admin: Send targeted or bulk notifications
 * @route POST /api/v1/admin/notifications/send
 * @access Admin
 */
export const sendNotificationsAdmin = catchAsync(async (req, res) => {
  const { type, title, message, target, role, recipientIds } = req.body;
  if (!type || !title || !message) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Notification title, message, and type are required."
    );
  }

  let recipients = [];
  let notificationType = "system"; // Default type for admin communications

  if (target === "bulk") {
    // Bulk send (e.g., to all users, or all tutors)
    const userQuery = {};
    if (role) {
      userQuery.role = role; // Target specific role (student, tutor, admin, etc.)
    }
    recipients = await User.find(userQuery).select("_id");
    notificationType = type;
  } else if (
    target === "targeted" &&
    Array.isArray(recipientIds) &&
    recipientIds.length > 0
  ) {
    // Targeted send to specific user IDs
    recipients = await User.find({ _id: { $in: recipientIds } }).select("_id");
    notificationType = type;
  } else {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Invalid notification target or missing recipient IDs."
    );
  }

  if (recipients.length === 0) {
    return sendResponse(res, {
      statusCode: httpStatus.NOT_FOUND,
      success: true,
      message: "No recipients found matching the criteria.",
      data: { count: 0 },
    });
  } // Create promises for all notifications

  const notificationPromises = recipients.map((user) =>
    createSingleNotification(user._id, notificationType, title, message)
  );

  const results = await Promise.allSettled(notificationPromises);
  const successCount = results.filter((r) => r.status === "fulfilled").length;

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Successfully sent ${successCount} notifications.`,
    data: {
      totalRecipients: recipients.length,
      successfulSends: successCount,
    },
  });
});
