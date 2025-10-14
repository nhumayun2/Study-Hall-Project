// WARNING: This script modifies your database directly! Use only for testing.

import mongoose from "mongoose";
import dotenv from "dotenv";
// We need 'path' to correctly locate the .env file, especially when running from a sub-directory
import path from "path";
import { User } from "./src/model/user.model.js"; // Adjust path as necessary

// --- FIX: Explicitly load the .env file from the project root ---
// This ensures process.env.MongoDB_URI is defined.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
// -----------------------------------------------------------------

const TUTOR_ID = "68ddf836cf286f78cead3b4b";
const MOCK_STRIPE_ACCOUNT_ID = "ac_mock_tutor_id_12345"; // Mock ID that passes the controller check

async function updateTutorStripeId() {
  try {
    // --- The error happens here because process.env.MongoDB_URI is undefined ---
    console.log(
      "Attempting to connect with URI:",
      process.env.MongoDB_URI ? "defined" : "undefined"
    );
    await mongoose.connect(process.env.MongoDB_URI);
    console.log("MongoDB connected successfully.");

    // Find the tutor and update their stripeAccountId
    const updatedUser = await User.findByIdAndUpdate(
      TUTOR_ID,
      { $set: { stripeAccountId: MOCK_STRIPE_ACCOUNT_ID } },
      { new: true, select: "name role stripeAccountId" }
    );

    if (updatedUser) {
      console.log(
        `\n✅ Success! Tutor ${updatedUser.name} (${TUTOR_ID}) updated.`
      );
      console.log(`New Stripe Account ID: ${updatedUser.stripeAccountId}`);
    } else {
      console.log(`\n❌ Error: Tutor with ID ${TUTOR_ID} not found.`);
    }
  } catch (error) {
    console.error(
      "An error occurred during tutor update:",
      error.message || error
    );
  } finally {
    await mongoose.disconnect();
    console.log("MongoDB connection closed.");
  }
}

updateTutorStripeId();
