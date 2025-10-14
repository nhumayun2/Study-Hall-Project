import mongoose from "mongoose";

const courseSchema = new mongoose.Schema(
  {
    tutor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true, // Ensuring course always has a tutor
    },
    title: {
      type: String,
      trim: true,
      required: true,
    },
    description: {
      type: String,
    },
    coverPhoto: {
      public_id: { type: String, default: "" },
      url: { type: String, default: "" },
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    subCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    isOnline: {
      type: Boolean,
      default: false,
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      required: function () {
        return !this.isOnline;
      },
    },
    duration: {
      type: Number, // in hours
    },
    feePerStudent: {
      type: Number,
      default: 0,
    },
    maxStudents: {
      type: Number,
      default: 1,
    }, // --- START: New Enrollment Fields ---
    enrolledStudents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ], // --- END: New Enrollment Fields ---
    cancellationPolicy: {
      type: String,
      enum: ["Flexible", "Moderate", "Strict"],
      default: "Flexible",
    },
    status: {
      type: String,
      enum: ["Active", "Deactivated", "Draft"],
      default: "Draft",
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export const Course = mongoose.model("Course", courseSchema);
