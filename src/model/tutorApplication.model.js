import mongoose from "mongoose";

const tutorApplicationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    // --- Professional Information ---
    bio: { type: String },
    occupation: { type: String, required: true },
    educationLevel: { type: String, required: true },
    major: { type: String, required: true },
    experience: { type: String },
    categoriesToTeach: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    ],

    // --- KYC (Know Your Customer) Documentation ---
    kycDocuments: {
      idType: {
        // ADDED: To store the type of ID (e.g., Passport, National ID)
        type: String,
        required: true,
      },
      idFront: {
        public_id: { type: String, required: true },
        url: { type: String, required: true },
      },
      idBack: {
        public_id: { type: String, required: true },
        url: { type: String, required: true },
      },
      selfie: {
        public_id: { type: String, required: true },
        url: { type: String, required: true },
      },
    },

    // ADDED: Array to hold multiple supporting document URLs
    supportingDocuments: [
      {
        public_id: { type: String, required: true },
        url: { type: String, required: true },
        _id: false,
      },
    ],

    // --- Admin Fields ---
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    rejectionReason: { type: String },
  },
  {
    timestamps: true,
  }
);

export const TutorApplication = mongoose.model(
  "TutorApplication",
  tutorApplicationSchema
);
