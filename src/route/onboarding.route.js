import express from "express";
import {
  createOnboardingLink,
  verifyOnboardingStatus,
} from "../controller/onboarding.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import httpStatus from "http-status";
import AppError from "../errors/AppError.js";

const router = express.Router();

// Middleware to ensure the user is either a Tutor OR a Location Owner
const isTutorOrLocationOwner = (req, res, next) => {
  const role = req.user?.role;
  if (role !== "Tutor" && role !== "LocationOwner") {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Access denied. Only Tutors and Location Owners can access onboarding."
    );
  }
  next();
};

// All routes require authentication and the correct role
router.use(protect, isTutorOrLocationOwner);

/**
 * @route POST /api/v1/onboarding/create-link
 * @description Creates a Stripe Express account (if needed) and generates an onboarding link.
 * @access Tutor, LocationOwner
 */
router.post("/create-link", createOnboardingLink);

/**
 * @route GET /api/v1/onboarding/verify-status
 * @description Verifies the status of the user's Stripe onboarding process.
 * @access Tutor, LocationOwner
 */
router.get("/verify-status", verifyOnboardingStatus);

export default router;
