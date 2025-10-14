import mongoose from "mongoose";

/**
 * @description Schema for in-app notifications sent to users.
 * This model is polymorphic, allowing notifications to link to various other entities
 * like sessions, transactions, or users, providing context and navigability.
 */
const notificationSchema = new mongoose.Schema(
  {
    // The user who will receive the notification.
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // A short, descriptive title for the notification.
    title: {
      type: String,
      required: true,
      trim: true,
    },

    // The main content of the notification message.
    message: {
      type: String,
      required: true,
      trim: true,
    },

    // A flag to track whether the user has viewed the notification.
    isRead: {
      type: Boolean,
      default: false,
    },

    // A category for the notification, which can be used for filtering or displaying different icons.
    type: {
      type: String,
      required: true,
      enum: [
        "NewMessage",
        "NewOffer", // A tutor has applied to a student's request.
        "OfferAccepted", // A student has accepted a tutor's offer.
        "SessionBooked", // A student has enrolled in a tutor's session.
        "SessionUpdate", // Details of a session have changed.
        "SessionCancelled",
        "ReviewReminder", // Reminder to review a completed session.
        "WithdrawalUpdate", // Status of a withdrawal request has changed.
        "KYCUpdate", // Status of a KYC application has changed.
        "AdminAlert", // A general notification from an admin.
        "System", // Automated system notifications.
      ],
    },

    // Polymorphic relationship to link the notification to a specific document.
    // This allows the frontend to navigate the user to the correct screen when a notification is tapped.
    relatedEntityId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "relatedEntityModel",
    },
    relatedEntityModel: {
      type: String,
      enum: [
        "Session",
        "User",
        "Transaction",
        "Withdrawal",
        "Chat",
        "Location",
      ],
    },
  },
  {
    timestamps: true,
  }
);

export const Notification = mongoose.model("Notification", notificationSchema);
