import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { Notification } from "../model/notification.model.js";

// Reusable function to create a new notification
export const addNotification = async (
  recipientId,
  type,
  title,
  message,
  relatedId,
  onModel
) => {
  // ... (Your existing addNotification implementation remains here) ...
  if (!recipientId || !type || !title || !message) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Required notification fields are missing"
    );
  }

  const notification = new Notification({
    recipient: recipientId,
    type,
    title,
    message,
    relatedId,
    onModel,
  });

  await notification.save();
  return notification;
};

// --- NEW CONTROLLER FOR TESTING/ADMIN ---
export const sendTestNotification = catchAsync(async (req, res) => {
  // NOTE: In a real application, you should also have an adminProtect middleware here
  // to ensure only admins can create arbitrary notifications for other users.

  // Destructure the required fields from the request body
  const { recipientId, type, title, message, relatedId, onModel } = req.body;

  if (!recipientId || !type || !title || !message) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Missing required fields: recipientId, type, title, or message."
    );
  }

  // Use the existing helper function
  const newNotification = await addNotification(
    recipientId,
    type,
    title,
    message,
    relatedId,
    onModel
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Test notification created successfully",
    data: newNotification,
  });
});
// --- END NEW CONTROLLER ---

// Get notifications for the logged-in user
export const getMyNotifications = catchAsync(async (req, res) => {
  const { filter } = req.query;
  const query = { recipient: req.user._id };

  if (filter === "unread") {
    query.read = false;
  }

  const notifications = await Notification.find(query).sort({ createdAt: -1 });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Notifications fetched successfully",
    data: notifications,
  });
});

// Mark a specific notification as read
export const markNotificationAsRead = catchAsync(async (req, res) => {
  const { id } = req.params;

  const notification = await Notification.findByIdAndUpdate(
    id,
    { read: true },
    { new: true }
  );

  if (!notification) {
    throw new AppError(httpStatus.NOT_FOUND, "Notification not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Notification marked as read",
    data: notification,
  });
});

// Delete a specific notification
export const deleteNotification = catchAsync(async (req, res) => {
  const { id } = req.params;

  const notification = await Notification.findByIdAndDelete(id);

  if (!notification) {
    throw new AppError(httpStatus.NOT_FOUND, "Notification not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Notification deleted successfully",
    data: null,
  });
});
