import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    // --- Core Information ---
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
    role: {
      type: String,
      enum: ["Student", "Tutor", "LocationOwner", "Admin"],
      required: true,
      default: "Student",
    },
    status: {
      type: String,
      enum: ["Active", "Inactive", "Blocked", "Pending"],
      default: "Active",
    },
    avatar: {
      public_id: { type: String, default: "" },
      url: { type: String, default: "" },
    },

    // --- Personal Information ---
    dob: { type: Date },
    gender: { type: String, enum: ["Male", "Female", "Other"] },

    // --- Embedded Minors for Parents ---
    minors: [
      {
        name: { type: String, required: true },
        dob: { type: Date, required: true },
        gender: { type: String },
        _id: false,
      },
    ],

    // --- Role-Specific Profiles ---
    tutorProfile: {
      bio: String,
      experience: String,
      educationLevel: String,
      major: String,
      categories: [mongoose.Schema.Types.ObjectId],
      isVerified: { type: Boolean, default: false },
      rating: { type: Number, default: 0 },
      totalReviews: { type: Number, default: 0 },
    },
    locationOwnerProfile: {
      businessName: String,
      isVerified: { type: Boolean, default: false },
    },

    // --- Financial Information ---
    wallet: {
      balance: { type: Number, default: 0 },
      pendingBalance: { type: Number, default: 0 },
    },
    beneficiaryInfo: {
      bankName: String,
      accountHolder: String,
      accountNumber: String,
    },
    stripeAccountId: { type: String, select: false },

    // --- Authentication & Security (Aligned with your original controller) ---
    verificationInfo: {
      verified: { type: Boolean, default: false },
      token: { type: String },
    },
    passwordResetToken: { type: String, select: false },
    refreshToken: { type: String, select: false },
    lastActive: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// --- PASSWORD HASHING MIDDLEWARE ---
userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

// --- INSTANCE METHOD (from your original logic) ---
// This method compares a candidate password with the user's hashed password.
userSchema.methods.isPasswordMatched = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.model("User", userSchema);
