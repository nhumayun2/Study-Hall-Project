import mongoose from "mongoose";

const locationOwnerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    businessAddress: {
      type: String,
      required: true,
      trim: true,
    },
    locations: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Location",
      },
    ],
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
  },
  {
    timestamps: true,
  }
);

export const LocationOwner = mongoose.model(
  "LocationOwner",
  locationOwnerSchema
);
