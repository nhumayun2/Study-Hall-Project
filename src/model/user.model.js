import mongoose from "mongoose";
import bcrypt from "bcryptjs";

/**
 * @description A unified schema for all user types in the application.
 * It includes embedded sub-documents for minors and role-specific profiles.
 */
const userSchema = new mongoose.Schema(
  {
    // --- CORE INFORMATION ---
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, select: false },
    avatar: {
      public_id: { type: String },
      url: { type: String },
    },
    gender: { type: String, enum: ["Male", "Female", "Other"] },
    dob: { type: Date },

    // --- ROLE & STATUS ---
    // A single role field to be compatible with your existing auth middleware.
    role: {
      type: String,
      enum: ["Student", "Tutor", "LocationOwner", "Admin"],
      required: true,
      default: "Student",
    },
    status: {
      type: String,
      enum: ["Active", "Inactive", "Blocked"],
      default: "Active",
    },

    // --- EMBEDDED SUB-DOCUMENTS ---
    // For parents to manage their children's accounts. Replaces the separate Minor model.
    minors: [
      {
        name: { type: String, required: true },
        gender: { type: String, enum: ["Male", "Female", "Other"] },
        dob: { type: Date, required: true },
      },
    ],
    // Contains information specific to a user when they are a Tutor.
    tutorProfile: {
      bio: { type: String },
      isVerified: { type: Boolean, default: false },
      // Other tutor-specific fields can be added here
    },
    // Contains information specific to a user when they own a location.
    locationOwnerProfile: {
      businessName: { type: String },
      isVerified: { type: Boolean, default: false },
      // Other owner-specific fields can be added here
    },

    // --- FINANCIAL INFORMATION ---
    wallet: {
      balance: { type: Number, default: 0 },
    },
    beneficiaryInfo: {
      bankName: { type: String },
      accountNumber: { type: String },
      accountHolder: { type: String },
    },
    stripeAccountId: { type: String, select: false },

    // --- AUTH & TOKENS ---
    verificationInfo: {
      verified: { type: Boolean, default: false },
      token: { type: String, select: false },
    },
    passwordResetToken: { type: String, select: false },
    refreshToken: { type: String, select: false },
  },
  {
    timestamps: true,
  }
);

// --- MIDDLEWARE ---
// Hashes the password automatically before a user document is saved.
userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  next();
});

// --- METHODS ---
// Instance method to compare passwords during login.
userSchema.methods.isPasswordMatched = async function (
  candidatePassword,
  hashedPassword
) {
  return await bcrypt.compare(candidatePassword, hashedPassword);
};

// --- EXPORT THE MODEL ---
// This is the line that makes `import { User }` work.
export const User = mongoose.model("User", userSchema);
