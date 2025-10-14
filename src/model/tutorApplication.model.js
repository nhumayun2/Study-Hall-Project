import mongoose from "mongoose";

/**
 * @description Schema to manage a user's application to become a Tutor.
 * This document holds all the necessary information for an admin to review
 * and approve/reject a user's request to gain the 'Tutor' role.
 */
const tutorApplicationSchema = new mongoose.Schema(
  {
    // A unique reference to the user who is applying.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // A user can only have one application.
      index: true,
    },

    // The current status of the application, managed by an admin.
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },

    // KYC (Know Your Customer) documents submitted by the user.
    // Stored as objects containing Cloudinary public_id and URL.
    kycDocuments: {
      idProofFront: {
        public_id: { type: String, required: true },
        url: { type: String, required: true },
      },
      idProofBack: {
        public_id: { type: String, required: true },
        url: { type: String, required: true },
      },
      selfie: {
        public_id: { type: String, required: true },
        url: { type: String, required: true },
      },
    },

    // Information about the applicant's professional and educational experience.
    experienceInfo: {
      occupation: { type: String, required: true },
      educationLevel: { type: String, required: true },
      major: { type: String, required: true },
      // Optional documents like certificates, CVs, etc.
      experienceDocuments: [
        {
          public_id: { type: String },
          url: { type: String },
        },
      ],
    },

    // A brief bio or description from the applicant.
    bio: {
      type: String,
      trim: true,
    },

    // The reason for rejection, provided by an admin.
    rejectionReason: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export const TutorApplication = mongoose.model(
  "TutorApplication",
  tutorApplicationSchema
);
