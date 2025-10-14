import express from "express";
import {
  addReview,
  getReviewsForSubject,
} from "../controller/review.controller.js";
import { protect, isStudent } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js"; // Assuming you might add image evidence later

const router = express.Router();

// ====================================================================
// --- PUBLIC ROUTE ---
// ====================================================================

/**
 * @route GET /api/v1/reviews/subject/:subjectId
 * @description Get all reviews for a specific subject (Tutor or Location).
 * The :subjectId can be a User ID (for a tutor) or a Location ID.
 * @access Public
 */
router.get("/subject/:subjectId", getReviewsForSubject);

// ====================================================================
// --- PROTECTED STUDENT ROUTE ---
// ====================================================================

/**
 * @route POST /api/v1/reviews
 * @description Add a new review for a completed session.
 * @access Student
 */
router.post(
  "/",
  protect,
  isStudent,
  // upload.array('evidence'), // Uncomment this if you want to allow image uploads for reviews
  addReview
);

export default router;
