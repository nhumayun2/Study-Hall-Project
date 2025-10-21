import express from "express";
import {
  getHomepageDetails,
  getMyPanelDetails,
} from "../controller/home.controller.js";
import { protect, isTutor } from "../middleware/auth.middleware.js";
import AppError from "../errors/AppError.js";
import httpStatus from "http-status";

// --- THIS IS THE NEW MIDDLEWARE ---
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
 * @description The main endpoint to get homepage data. The controller logic will
 * differentiate the response based on the logged-in user's role.
 * @access Authenticated (Student, Tutor, LocationOwner)
 */
router.get("/", protect, getHomepageDetails);

/**
 * @route GET /api/v1/home/my-panel
 * @description The endpoint for a user to get all the data needed for their "My Panel" screen.
 * @access Tutor, LocationOwner
 */
// --- THIS IS THE FIX ---
// We replace `isTutor` with our new, more flexible middleware.
router.get("/my-panel", protect, isTutorOrLocationOwner, getMyPanelDetails);

export default router;
