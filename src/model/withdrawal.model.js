import mongoose from "mongoose";

/**
 * @description Schema for handling withdrawal requests from Tutors and Location Owners.
 * A withdrawal document represents a request that is pending, approved, or rejected by an admin.
 * An 'Approved' withdrawal will subsequently generate a 'Withdrawal' type Transaction.
 */
const withdrawalSchema = new mongoose.Schema(
  {
    // The user (Tutor or LocationOwner) requesting the withdrawal.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // The role of the user at the time of the request. Useful for quick filtering in the admin panel.
    userRole: {
      type: String,
      enum: ["Tutor", "LocationOwner"],
      required: true,
    },

    // The amount of money requested for withdrawal.
    amount: {
      type: Number,
      required: [true, "Withdrawal amount is required."],
      min: [1, "Amount must be a positive number."],
    },

    // The current lifecycle status of the withdrawal request.
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected", "Processing", "Failed"],
      default: "Pending",
    },

    // The method the user wants to use for the payout.
    payoutMethod: {
      type: String,
      default: "Stripe", // Or could be an enum like ['Stripe', 'PayPal']
    },

    // A snapshot of the user's beneficiary details at the time of the request.
    // This is crucial for auditing and ensures the payout goes to the intended account,
    // even if the user changes their profile details while the request is pending.
    beneficiaryInfo: {
      bankName: { type: String },
      accountNumber: { type: String },
      accountHolder: { type: String },
    },

    // The unique ID for the payout transaction from the payment gateway (e.g., Stripe Payout ID: po_...).
    paymentGatewayPayoutId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },

    // Admin-related fields for auditing purposes.
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // The admin who processed the request.
    },
    processedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    indexes: [{ fields: { user: 1, status: 1 } }],
  }
);

export const Withdrawal = mongoose.model("Withdrawal", withdrawalSchema);
