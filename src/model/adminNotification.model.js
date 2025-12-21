import mongoose from "mongoose";

const adminNotificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Notification title is required"],
      trim: true,
    },
    message: {
      type: String,
      required: [true, "Notification content is required"],
      trim: true,
    },
    targetAudience: {
      type: String,
      enum: ["All", "Student", "Tutor", "LocationOwner"],
      default: "All",
      required: true,
    },
    filters: {
      type: Map,
      of: String,
      default: {},
    },
    status: {
      type: String,
      enum: ["Draft", "Scheduled", "Sent"],
      default: "Draft",
      index: true,
    },
    scheduledDate: {
      type: Date,
    },
    sentAt: {
      type: Date,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const AdminNotification = mongoose.model(
  "AdminNotification",
  adminNotificationSchema
);