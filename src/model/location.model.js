import mongoose from "mongoose";

// Sub-schema for GeoJSON Point for better map integration
const pointSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["Point"],
    required: true,
    default: "Point",
  },
  coordinates: {
    type: [Number], // [longitude, latitude]
    required: true,
  },
});

const locationSchema = new mongoose.Schema(
  {
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
    // CORRECTED: Address is now a structured object for searchability.
    address: {
      street: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
    },
    // GeoJSON field for future map functionality
    location: {
      type: pointSchema,
      index: "2dsphere", // Critical for location-based queries
    },
    photos: [
      {
        public_id: { type: String },
        url: { type: String },
        _id: false,
      },
    ],
    type: {
      type: String, // e.g., 'Cafe', 'Office', 'Studio'
      required: true,
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
    description: { type: String },
    // ADDED: The rules field from the Figma design.
    rules: { type: String },

    // --- Admin & Rating Fields ---
    rating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },
    approvalStatus: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    isActive: { type: Boolean, default: false },
    rejectionReason: { type: String },
  },
  {
    timestamps: true,
  }
);

export const Location = mongoose.model("Location", locationSchema);
