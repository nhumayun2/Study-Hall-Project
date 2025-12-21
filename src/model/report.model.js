import mongoose from "mongoose";

/**
 * @description Schema for user-submitted reports against other users, sessions, or locations.
 * This model is polymorphic, allowing reports to target different types of content.
 */
const reportSchema = new mongoose.Schema(
  {
    // The user who submitted the report.
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // The subject of the report (what is being reported).
    reportSubjectId: {
      type: mongoose.Schema.Types.ObjectId,
      //required: true,
      refPath: "reportSubjectModel", // Mongoose will use the value of 'reportSubjectModel' to determine which model to populate from.
    },
    reportSubjectModel: {
      type: String,
      //required: true,
      enum: ["User", "Session", "Location"], // Defines the possible types of content that can be reported.
    },

    // The reason for the report, chosen from a predefined list.
    reason: {
      type: String,
      required: true,
      enum: [
        // These values should align with the options presented in the UI.
        "Inappropriate Content",
        "Spam or Scam",
        "Harassment or Bullying",
        "Misleading Information",
        "Safety Concern",
        "Other",
      ],
    },

    // A detailed description provided by the reporter.
    description: {
      type: String,
      required: true,
      trim: true,
    },

    // Evidence images uploaded by the reporter.
    evidence: [
      {
        public_id: { type: String },
        url: { type: String },
      },
    ],

    // The current status of the report, managed by an admin.
    status: {
      type: String,
      enum: ["Open", "Closed"], // As seen in the admin panel Figma design.
      default: "Open",
      index: true,
    },

    // Optional field for an admin to add notes when resolving a report.
    adminNotes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Report = mongoose.model("Report", reportSchema);
