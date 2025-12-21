import express from "express";
import {
  getHomepageDetails,
  getMyPanelDetails,
  getPublicCategories, // <-- Import our new function
} from "../controller/home.controller.js";
import { protect, isTutor } from "../middleware/auth.middleware.js";
import AppError from "../errors/AppError.js";
import httpStatus from "http-status";
// We no longer need 'getAllCategoriesAndSubs' from settings.controller.js
// import { getAllCategoriesAndSubs } from "../controller/settings.controller.js";

// This middleware will check if the user is either a Tutor OR a Location Owner.
const isTutorOrLocationOwner = (req, res, next) => {
  const role = req.user?.role;
  if (role !== "Tutor" && role !== "LocationOwner") {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Access denied. Only Tutors and Location Owners can access this feature."
    );
  }
  next();
};

const router = express.Router();

/**
 * @route GET /api/v1/home
 * @description The main endpoint to get homepage data for the logged-in user.
 * @access Authenticated (Student, Tutor, LocationOwner)
 */
router.get("/", protect, getHomepageDetails);

/**
 * @route GET /api/v1/home/my-panel
 * @description The endpoint for a user to get data for their "My Panel" screen.
 * @access Tutor, LocationOwner
 */
router.get("/my-panel", protect, isTutorOrLocationOwner, getMyPanelDetails);

// --- THIS IS THE NEW PUBLIC ROUTE ---
/**
 * @route GET /api/v1/home/categories
 * @description (NEW) Fetches all active categories with a count of active sessions.
 * @access Public
 */
router.get("/categories", getPublicCategories); // No 'protect' middleware, so it's public.


export default router;
