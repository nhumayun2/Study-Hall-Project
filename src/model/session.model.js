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
    checkOutToken: { type: String, select: false },
    adminCommission: { type: Number, default: 0 },
    tutorEarnings: { type: Number, default: 0 },
    locationOwnerEarnings: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// --- The pre-save hook has been REMOVED from this model ---

export const Session = mongoose.model("Session", sessionSchema);
