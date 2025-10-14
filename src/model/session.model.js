import mongoose from "mongoose";
import { Settings } from "./settings.model.js";

/**
 * @description Sub-schema to track individual student attendance within a session.
 */
const attendanceSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    checkIn: {
      timestamp: { type: Date, default: null },
      token: { type: String, default: null }, // Token used for check-in
    },
    checkOut: {
      timestamp: { type: Date, default: null },
    },
  },
  { _id: false }
);

const sessionSchema = new mongoose.Schema(
  {
    // Core Identity
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: { type: String, enum: ["Request", "Offer"], required: true },
    status: {
      type: String,
      enum: [
        "Pending", // Student Request, waiting for offers
        "Active", // Tutor Offer, available for booking
        "AwaitingTutorSelection", // Student Request, has offers
        "Booked", // Session is full or confirmed
        "Ongoing", // First student has checked in
        "Completed", // All checked-in students have checked out
        "Cancelled",
        "Blocked",
      ],
      required: true,
    },

    // Basic Information
    title: { type: String, required: true },
    description: { type: String },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    subCategory: { type: mongoose.Schema.Types.ObjectId, ref: "SubCategory" },
    coverPhoto: { public_id: String, url: String },
    tags: [String],

    // Schedule & Pricing
    schedule: {
      date: { type: Date, required: true },
      startTime: { type: String, required: true },
      duration: { type: Number, required: true }, // in minutes
    },
    price: { type: Number, required: true },
    maxStudents: { type: Number, default: 1 },

    // Location Information
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      required: true,
    },

    // Relationships & Participants
    acceptedTutor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    enrolledStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    tutorApplicants: [
      {
        tutorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        offerPrice: { type: Number },
        status: {
          type: String,
          enum: ["Pending", "Withdrawn"],
          default: "Pending",
        },
      },
    ],

    // NEW: Replaced checkIn/checkOut with a more robust attendance array
    attendance: [attendanceSchema],

    // Policies and Notes
    cancellationPolicy: {
      type: String,
      enum: ["Flexible", "Moderate", "Strict"],
      default: "Flexible",
    },
    cancellationDetails: {
      cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reason: { type: String },
      timestamp: { type: Date },
    },
    tutorNote: { type: String },

    // Financials
    paymentIntentId: { type: String },
    adminCommission: { type: Number, default: 0 },
    tutorEarnings: { type: Number, default: 0 },
    locationOwnerEarnings: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Middleware to calculate profit distribution when session is marked as Completed
sessionSchema.pre("save", async function (next) {
  // Trigger calculation only when the status is changed to 'Completed' and price is > 0
  if (
    this.isModified("status") &&
    this.status === "Completed" &&
    this.price > 0
  ) {
    try {
      const settings = await Settings.getSettings();
      // Price is per student, so total revenue is price * number of attendees
      const totalAmount =
        this.price * this.attendance.filter((a) => a.checkIn.timestamp).length;

      const platformRate = settings.profitDistribution.platform / 100;
      const tutorRate = settings.profitDistribution.tutor / 100;
      const locationOwnerRate = settings.profitDistribution.locationOwner / 100;

      this.adminCommission = parseFloat(
        (totalAmount * platformRate).toFixed(2)
      );
      this.tutorEarnings = parseFloat((totalAmount * tutorRate).toFixed(2));
      this.locationOwnerEarnings = parseFloat(
        (totalAmount * locationOwnerRate).toFixed(2)
      );
    } catch (error) {
      console.error("Error calculating profit distribution:", error);
    }
  }
  next();
});

export const Session = mongoose.model("Session", sessionSchema);
