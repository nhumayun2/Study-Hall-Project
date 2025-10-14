import mongoose from "mongoose";

/**
 * @description Schema for recording all financial transactions within the system.
 * This includes student payments for sessions, tutor/location owner withdrawals,
 * and admin-processed refunds.
 */
const transactionSchema = new mongoose.Schema(
  {
    // The user associated with the transaction.
    // For 'Payment'/'Refund', this is the Student.
    // For 'Withdrawal', this is the Tutor or LocationOwner.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // The type of financial event.
    type: {
      type: String,
      enum: ["Payment", "Withdrawal", "Refund"],
      required: true,
    },

    // The monetary value of the transaction. Always stored as a positive number.
    amount: {
      type: Number,
      required: [true, "Transaction amount is required."],
      min: [0.01, "Transaction amount must be positive."],
    },

    // The current state of the transaction.
    status: {
      type: String,
      enum: [
        "Pending", // Awaiting processing (e.g., withdrawal request)
        "Processing", // Actively being processed by a payment gateway or admin.
        "Completed", // The transaction was successful (payment captured, withdrawal sent).
        "Failed", // The transaction failed.
        "Refunded", // The full amount of a 'Payment' has been returned.
        "Partially-Refunded", // A portion of a 'Payment' has been returned.
      ],
      default: "Pending",
    },

    // A generic field to store the unique ID from the payment gateway (e.g., Stripe Payment Intent ID, Payout ID, etc.).
    paymentGatewayId: {
      type: String,
      trim: true,
      index: true,
      sparse: true, // Allows for null values to not conflict with the unique index.
    },

    // Links the transaction directly to the session it's related to.
    // Required for 'Payment' and 'Refund' types.
    relatedSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: function () {
        return this.type === "Payment" || this.type === "Refund";
      },
    },

    // For 'Refund' transactions, this links back to the original 'Payment' transaction.
    // This is crucial for auditing and preventing double refunds.
    sourceTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: function () {
        return this.type === "Refund";
      },
    },

    // A description or note for the transaction, often added by an admin during a refund or manual adjustment.
    description: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Transaction = mongoose.model("Transaction", transactionSchema);
