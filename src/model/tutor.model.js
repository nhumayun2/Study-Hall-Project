import mongoose from "mongoose";

const tutorSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    kycDocuments: {
      idType: { type: String },
      idProof: {
        front: { type: String, default: "" },
        back: { type: String, default: "" },
      },
      selfie: { type: String, default: "" },
      status: {
        type: String,
        enum: ["Pending", "Approved", "Rejected"],
        default: "Pending",
      },
      rejectionReason: { type: String },
    },
    experienceInfo: {
      occupation: { type: String },
      educationLevel: { type: String },
      major: { type: String },
      categories: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Category",
        },
      ],
      documents: [{ type: String }],
    },
    level: {
      type: Number,
      default: 1,
    },
    rating: {
      type: Number,
      default: 0,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
    totalStudents: {
      type: Number,
      default: 0,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    customAvailability: [
      {
        day: { type: String },
        availableTimes: [{ from: { type: String }, to: { type: String } }],
      },
    ],
  },
  {
    timestamps: true,
  }
);

export const Tutor = mongoose.model("Tutor", tutorSchema);
