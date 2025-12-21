import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: function () {
        return !this.googleId && !this.facebookId;
      },
      select: false,
    },

    googleId: { type: String },
    facebookId: { type: String },

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

    dob: { type: Date },
    gender: { type: String, enum: ["Male", "Female", "Other"] },

    minors: [
      {
        name: { type: String, required: true },
        dob: { type: Date, required: true },
        gender: { type: String },
      },
    ],

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

userSchema.pre("save", async function (next) {
  if (this.isModified("password") && this.password) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

userSchema.methods.isPasswordMatched = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.model("User", userSchema);