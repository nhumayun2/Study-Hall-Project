import express from "express";
import {
  setMyAvailability,
  getTutorAvailability,
} from "../controller/tutorAvailability.controller.js";
import { protect, isTutor } from "../middleware/auth.middleware.js";

const router = express.Router();

// ====================================================================
// --- TUTOR ROUTE (Protected) ---
// ====================================================================

/**
 * @route PUT /api/v1/availability
 * @description A logged-in tutor sets or updates their own availability.
 * The tutor's ID is taken from the authenticated user token.
 * @access Tutor
 */
router.put("/", protect, isTutor, setMyAvailability);

// ====================================================================
// --- PUBLIC ROUTE ---
// ====================================================================

/**
 * @route GET /api/v1/availability/:tutorId
 * @description Gets the publicly available calendar information for a specific tutor.
 * @access Public
 */
router.get("/:tutorId", getTutorAvailability);

export default router;
