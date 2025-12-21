import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import AppError from "../errors/AppError.js";
import { AdminNotification } from "../model/adminNotification.model.js";
import { Notification } from "../model/notification.model.js";
import { User } from "../model/user.model.js";

const _distributeCampaign = async (adminNotification) => {
  let query = {};

  if (adminNotification.targetAudience !== "All") {
    query.role = adminNotification.targetAudience;
  }

  const recipients = await User.find(query).select("_id");

  if (recipients.length === 0) return 0;

  // 3. Prepare Bulk Insert Operations
  const notificationsToInsert = recipients.map((user) => ({
    recipient: user._id,
    title: adminNotification.title,
    message: adminNotification.message,
    type: "AdminAlert", // Special type for admin blasts
    isRead: false,
    relatedEntityId: adminNotification._id, // Optional: link back to campaign
    // relatedEntityModel: "AdminNotification" // If your polymorphic model supports it
  }));

  // 4. Execute Bulk Insert (More efficient than loop)
  await Notification.insertMany(notificationsToInsert);

  return recipients.length;
};

// ====================================================================
// --- CONTROLLER FUNCTIONS ---
// ====================================================================

/**
 * @description ADMIN creates a new notification campaign (Draft, Scheduled, or Sent).
 * @route POST /api/v1/admin/notifications
 * @access Admin
 */
export const createNotification = catchAsync(async (req, res) => {
  const { title, message, targetAudience, status, scheduledDate } = req.body;
  const adminId = req.user._id;

  if (!title || !message) {
    throw new AppError(httpStatus.BAD_REQUEST, "Title and message are required.");
  }

  // 1. Create the Master Record
  const campaign = await AdminNotification.create({
    title,
    message,
    targetAudience,
    status: status || "Draft",
    scheduledDate: status === "Scheduled" ? scheduledDate : null,
    createdBy: adminId,
    sentAt: status === "Sent" ? new Date() : null,
  });

  // 2. If status is "Sent", trigger distribution immediately
  let recipientCount = 0;
  if (campaign.status === "Sent") {
    recipientCount = await _distributeCampaign(campaign);
  }

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message:
      campaign.status === "Sent"
        ? `Notification sent successfully to ${recipientCount} users.`
        : `Notification saved as ${campaign.status}.`,
    data: campaign,
  });
});

/**
 * @description ADMIN gets a list of all notification campaigns.
 * @route GET /api/v1/admin/notifications
 * @access Admin
 */
export const getAllNotifications = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, status, search } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const query = {};

  if (status) query.status = status;
  if (search) {
    query.title = { $regex: search, $options: "i" };
  }

  const total = await AdminNotification.countDocuments(query);
  const notifications = await AdminNotification.find(query)
    .populate("createdBy", "name")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Notification campaigns fetched successfully.",
    data: {
      notifications,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
    },
  });
});

/**
 * @description ADMIN gets details of a single campaign.
 * @route GET /api/v1/admin/notifications/:id
 * @access Admin
 */
export const getNotificationDetails = catchAsync(async (req, res) => {
  const { id } = req.params;
  const notification = await AdminNotification.findById(id).populate(
    "createdBy",
    "name email"
  );

  if (!notification) {
    throw new AppError(httpStatus.NOT_FOUND, "Notification campaign not found.");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Notification details fetched.",
    data: notification,
  });
});

/**
 * @description ADMIN updates a draft or scheduled notification.
 * @route PATCH /api/v1/admin/notifications/:id
 * @access Admin
 */
export const updateNotification = catchAsync(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const campaign = await AdminNotification.findById(id);
  if (!campaign) {
    throw new AppError(httpStatus.NOT_FOUND, "Notification campaign not found.");
  }

  if (campaign.status === "Sent") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Cannot edit a notification that has already been sent."
    );
  }

  // Apply updates
  Object.assign(campaign, updates);

  // If status changed to "Sent", update timestamp
  if (updates.status === "Sent") {
    campaign.sentAt = new Date();
  }

  await campaign.save();

  // Trigger distribution if status became "Sent"
  let recipientCount = 0;
  if (campaign.status === "Sent") {
    recipientCount = await _distributeCampaign(campaign);
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message:
      campaign.status === "Sent"
        ? `Notification updated and sent to ${recipientCount} users.`
        : "Notification updated successfully.",
    data: campaign,
  });
});

/**
 * @description ADMIN deletes a notification campaign.
 * @route DELETE /api/v1/admin/notifications/:id
 * @access Admin
 */
export const deleteNotification = catchAsync(async (req, res) => {
  const { id } = req.params;
  const campaign = await AdminNotification.findByIdAndDelete(id);

  if (!campaign) {
    throw new AppError(httpStatus.NOT_FOUND, "Notification campaign not found.");
  }

  // Note: We generally do NOT delete the individual user notifications 
  // that were already sent, as users might still want to see them in their history.

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Notification campaign deleted successfully.",
    data: null,
  });
});