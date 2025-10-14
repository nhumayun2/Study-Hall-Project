import mongoose from "mongoose";

/**
 * @description The schema for managing rentable locations.
 * This model holds all details about a physical space that can be booked for a session.
 */
const locationSchema = new mongoose.Schema(
  {
    // --- Core Information ---
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    rules: {
      type: String,
      trim: true,
    },
    photos: [
      {
        public_id: { type: String, required: true },
        url: { type: String, required: true },
      },
    ],

    // --- Address & Geolocation ---
    address: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      zipCode: { type: String },
      // Storing as a GeoJSON Point for geospatial queries (e.g., "find locations within 5km")
      coordinates: {
        type: {
          type: String,
          enum: ["Point"],
          default: "Point",
        },
        coordinates: {
          type: [Number], // [longitude, latitude]
          index: "2dsphere", // Important for location-based searching
        },
      },
    },

    // --- Location Attributes (from Figma filters) ---
    type: {
      type: String, // e.g., "Cafe", "Library", "Workspace"
      trim: true,
    },
    noiseLevel: {
      type: String,
      enum: ["Low", "Moderate", "High"],
      default: "Moderate",
    },
    maxCapacity: {
      type: Number,
      required: true,
      min: 1,
    },

    // --- Reviews & Ratings ---
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },

    // --- Admin & Status Management ---
    approvalStatus: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    isActive: {
      // Can be toggled by Admin or Owner
      type: Boolean,
      default: true,
    },
    rejectionReason: {
      type: String,
    },

    // Note: Availability for locations can be complex. For now, we assume it's always available
    // unless a session is booked. A more advanced system could have a dedicated availability model
    // similar to the tutor's, if locations have specific open/closed hours.
  },
  {
    timestamps: true,
  }
);

export const Location = mongoose.model("Location", locationSchema);