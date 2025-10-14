import mongoose from "mongoose";
import { User } from "./user.model.js";
import { Location } from "./location.model.js";

/**
 * @description The schema for reviews.
 * This is a polymorphic model, meaning a single review can be for different
 * types of entities (either a User for a tutor review, or a Location).
 */
const reviewSchema = new mongoose.Schema(
  {
    // --- The Context of the Review ---
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: true,
      index: true,
    },
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // --- The Subject of the Review (Polymorphic Association) ---
    reviewSubjectId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      // This tells Mongoose to look at the 'reviewSubjectModel' field
      // to determine which collection to reference (either 'User' or 'Location').
      refPath: "reviewSubjectModel",
    },
    reviewSubjectModel: {
      type: String,
      required: true,
      enum: ["User", "Location"], // The two models that can be reviewed
    },

    // --- The Review Content ---
    rating: {
      type: String, // As per Figma: "Unsatisfied", "Neutral", "Satisfied", "Very Satisfied"
      enum: ["Unsatisfied", "Neutral", "Satisfied", "Very Satisfied"],
      required: true,
    },
    comment: {
      type: String,
      trim: true,
    },
    evidence: [
      {
        // Corresponds to "Upload Evidence" in Figma
        public_id: { type: String, required: true },
        url: { type: String, required: true },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// --- MIDDLEWARE ---
// After a review is saved, this middleware automatically updates the average rating
// and total review count on the corresponding User (Tutor) or Location document.
reviewSchema.post("save", async function (doc, next) {
  try {
    const subjectModel = doc.reviewSubjectModel === "User" ? User : Location;
    const subjectId = doc.reviewSubjectId;

    // 1. Find all reviews for this subject
    const reviews = await mongoose
      .model("Review")
      .find({ reviewSubjectId: subjectId });

    if (reviews.length > 0) {
      // 2. Calculate the new average rating
      const ratingMap = {
        Unsatisfied: 1,
        Neutral: 2,
        Satisfied: 3,
        "Very Satisfied": 4,
      }; // Or use a 1-5 scale if you prefer
      const totalRating = reviews.reduce(
        (acc, item) => acc + (ratingMap[item.rating] || 0),
        0
      );
      const averageRating = parseFloat(
        (totalRating / reviews.length).toFixed(2)
      );

      // 3. Update the subject document with the new average rating and total review count
      await subjectModel.findByIdAndUpdate(subjectId, {
        rating: averageRating,
        totalReviews: reviews.length,
      });
    }
  } catch (error) {
    console.error("Error updating average rating:", error);
    // We don't block the main operation, but we log the error
  }
  next();
});

export const Review = mongoose.model("Review", reviewSchema);
