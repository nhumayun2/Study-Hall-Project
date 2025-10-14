import express from "express";
import {
  getAllTutorApplications,
  getTutorApplicationDetails,
  approveTutorApplication,
  rejectTutorApplication,
} from "../controller/admin.application.controller.js";
import { protect, isAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

// All routes in this file are protected and require admin privileges
router.use(protect, isAdmin);

/**
 * @route GET /api/v1/admin/applications/tutors
 * @description Get a list of all tutor applications with filtering.
 * @access Admin
 */
router.get("/tutors", getAllTutorApplications);

/**
 * @route GET /api/v1/admin/applications/tutors/:applicationId
 * @description Get detailed information for a single tutor application.
 * @access Admin
 */
router.get("/tutors/:applicationId", getTutorApplicationDetails);

/**
 * @route PATCH /api/v1/admin/applications/tutors/:applicationId/approve
 * @description Approve a tutor application and promote the user.
 * @access Admin
 */
router.patch("/tutors/:applicationId/approve", approveTutorApplication);

/**
 * @route PATCH /api/v1/admin/applications/tutors/:applicationId/reject
 * @description Reject a tutor application.
 * @access Admin
 */
router.patch("/tutors/:applicationId/reject", rejectTutorApplication);

export default router;
