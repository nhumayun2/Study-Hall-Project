import express from "express";
import {
  getAllSessionsAdmin,
  getSessionDetailsAdmin,
  toggleSessionBlockStatusAdmin,
  getSessionReviewsAdmin,
  updateSessionStatusAdmin,
} from "../controller/admin.session.controller.js"; // Import the session controller

const router = express.Router();

// NOTE: Middleware is applied in the parent admin.route.js file.

// -------------------------------------------------------------
// SESSION MANAGEMENT ROUTES
// -------------------------------------------------------------

// @route GET /api/v1/admin/sessions
// @desc Get list of all sessions with filtering/pagination for admin panel
router.route("/").get(getAllSessionsAdmin);

// @route GET /api/v1/admin/sessions/:sessionId
// @desc Get detailed information for a specific session
router.route("/:sessionId").get(getSessionDetailsAdmin);

// @route PATCH /api/v1/admin/sessions/:sessionId/block
// @desc Block or Unblock a specific session
router.route("/:sessionId/block").patch(toggleSessionBlockStatusAdmin);

// @route GET /api/v1/admin/sessions/:sessionId/reviews
// @desc Get all associated reviews (student, tutor, location) for a specific session
router.route("/:sessionId/reviews").get(getSessionReviewsAdmin);

// @route PATCH /api/v1/admin/sessions/:sessionId/status
// @desc Manually update session status or resolve dispute
router.route("/:sessionId/status").patch(updateSessionStatusAdmin);

export default router;
