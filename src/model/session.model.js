import mongoose from "mongoose";
import { Settings } from "./settings.model.js";

/**
 * @description Sub-schema for an individual enrollment (a "booking" or "ticket").
 * This will replace the old `enrolledStudents` array.
 */
const enrollmentSchema = new mongoose.Schema({
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  // An array of _id's from the User.minors sub-document array.
  minors: [
    {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
  ],
  paymentIntentId: {
    type: String,
    required: true,
  },
  // Store a snapshot of the price at the time of booking
  pricePerMinor: {
    type: Number,
    required: true,
  },
  totalAmount: {
    type: Number,
    required: true,
  },
});

/**
 * @description Sub-schema to track individual student attendance within a session.
 *
 * --- THIS IS THE FIX ---
 * We are REMOVING the `{ _id: false }` option.
 * Mongoose will now add a unique `_id` to each attendance record,
 * which is essential for it to reliably track changes to nested objects
 * like `checkIn.token` and `checkOut.token`.
 *
 * --- AND ---
 * We are replacing `student` (Parent ID) with `enrollmentId` and `minorId`
 * to track attendance for each specific child.
 * --- END FIX ---
 */
const attendanceSchema = new mongoose.Schema(
  {
    // A reference to the specific enrollment "ticket"
    enrollmentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    // The specific _id of the minor from the User.minors array
    minorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    checkIn: {
      timestamp: { type: Date, default: null },
      token: { type: String, default: null },
    },
    checkOut: {
      timestamp: { type: Date, default: null },
      token: { type: String, default: null },
    },
  }
  // `{ _id: false }` has been removed from here.
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
        "Pending",
        "Active",
        "AwaitingTutorSelection",
        "Booked",
        "Ongoing",
        "Completed",
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
    // Price is now PER STUDENT/MINOR
    price: { type: Number, required: true },
    // MaxStudents is the total number of minors allowed
    maxStudents: { type: Number, default: 1 },

    // Location Information
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      required: true,
    },

    // Relationships & Participants
    acceptedTutor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // --- REPLACED `enrolledStudents` WITH `enrollments` ---
    // enrolledStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // <--- OLD
    enrollments: [enrollmentSchema], // <--- NEW

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

    attendance: [attendanceSchema], // This schema is now fixed

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
    // --- REMOVED `paymentIntentId` from the session. It's now in the `enrollmentSchema` ---
    // paymentIntentId: { type: String }, // <--- OLD
    checkOutToken: { type: String, select: false },
    adminCommission: { type: Number, default: 0 },
    tutorEarnings: { type: Number, default: 0 },
    locationOwnerEarnings: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Session = mongoose.model("Session", sessionSchema);
