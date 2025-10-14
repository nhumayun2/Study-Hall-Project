import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { Review } from "../model/review.model.js";
import { Session } from "../model/session.model.js";
import { User } from "../model/user.model.js";
import { Location } from "../model/location.model.js";
import mongoose from "mongoose";

// ====================================================================
// --- HELPER FUNCTION ---
// ====================================================================

/**
 * @description Internal helper to recalculate and update the average rating for a Tutor or Location.
 */
const _updateAverageRating = async (subjectId, subjectModel) => {
  const subjectIdObject = new mongoose.Types.ObjectId(subjectId);

  const stats = await Review.aggregate([
    { $match: { reviewSubjectId: subjectIdObject } },
    {
      $group: {
        _id: "$reviewSubjectId",
        averageRating: { $avg: "$rating" },
        totalReviews: { $sum: 1 },
      },
    },
  ]);

  if (stats.length > 0) {
    const { averageRating, totalReviews } = stats[0];
    const roundedRating = parseFloat(averageRating.toFixed(2));

    if (subjectModel === "User") {
      await User.findByIdAndUpdate(subjectId, {
        "tutorProfile.rating": roundedRating,
        "tutorProfile.totalReviews": totalReviews,
      });
    } else if (subjectModel === "Location") {
      await Location.findByIdAndUpdate(subjectId, {
        rating: roundedRating,
        totalReviews: totalReviews,
      });
    }
  }
};

// ====================================================================
// --- MAIN CONTROLLERS ---
// ====================================================================

/**
 * @description USER (Student) adds a review for a tutor or location after a session is completed.
 * @route POST /api/v1/reviews
 * @access Student
 */
export const addReview = catchAsync(async (req, res) => {
  const reviewerId = req.user._id;
  const {
    sessionId,
    reviewSubjectId,
    reviewSubjectModel,
    rating,
    comment,
    evidence,
  } = req.body;

  if (!sessionId || !reviewSubjectId || !reviewSubjectModel || !rating) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Session, subject, and rating are required."
    );
  }

  // 1. Verify the session exists and is completed
  const session = await Session.findById(sessionId);
  if (!session) {
    throw new AppError(httpStatus.NOT_FOUND, "Session not found.");
  }
  if (session.status !== "Completed") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You can only review a session after it is completed."
    );
  }

  // 2. Verify the reviewer was a participant in the session
  const isParticipant = session.enrolledStudents.includes(reviewerId);
  if (!isParticipant) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You cannot review a session you did not attend."
    );
  }

  // 3. Verify the subject of the review was part of the session
  const isValidSubject =
    (reviewSubjectModel === "User" &&
      session.acceptedTutor.toString() === reviewSubjectId) ||
    (reviewSubjectModel === "Location" &&
      session.location.toString() === reviewSubjectId);

  if (!isValidSubject) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "The review subject is not associated with this session."
    );
  }

  // 4. Check if the user has already reviewed this subject for this session
  const existingReview = await Review.findOne({
    reviewer: reviewerId,
    sessionId,
    reviewSubjectId,
  });
  if (existingReview) {
    throw new AppError(
      httpStatus.CONFLICT,
      "You have already submitted a review for this subject for this session."
    );
  }

  // 5. Create the new review
  const newReview = await Review.create({
    reviewer: reviewerId,
    sessionId,
    reviewSubjectId,
    reviewSubjectModel,
    rating,
    comment,
    evidence, // Assuming evidence is handled and URLs are provided
  });

  // 6. Update the average rating for the subject
  await _updateAverageRating(reviewSubjectId, reviewSubjectModel);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Your review has been submitted successfully.",
    data: newReview,
  });
});

/**
 * @description Get all reviews for a specific subject (Tutor or Location).
 * @route GET /api/v1/reviews/subject/:subjectId
 * @access Public
 */
export const getReviewsForSubject = catchAsync(async (req, res) => {
  const { subjectId } = req.params;

  const reviews = await Review.find({ reviewSubjectId: subjectId })
    .populate("reviewer", "name avatar")
    .sort({ createdAt: -1 });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Reviews fetched successfully.",
    data: reviews,
  });
});
