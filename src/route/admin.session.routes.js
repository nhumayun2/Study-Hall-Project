import express from "express";
import {
  getAllSessions,
  getSessionDetails,
  updateSessionStatus,
  toggleSessionBlockStatus,
  getSessionReviews,
} from "../controller/admin.session.controller.js";
import { protect, isAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

// All routes in this file are protected and require admin privileges
router.use(protect, isAdmin);

/**
 * @route GET /api/v1/admin/sessions
 * @description Get a list of all sessions with filtering and pagination.
 * @access Admin
 */
router.get("/", getAllSessions);

/**
 * @route GET /api/v1/admin/sessions/:sessionId
 * @description Get detailed information for a single session.
 * @access Admin
 */
router.get("/:sessionId", getSessionDetails);

/**
 * @route GET /api/v1/admin/sessions/:sessionId/reviews
 * @description Get all reviews associated with a specific session.
 * @access Admin
 */
router.get("/:sessionId/reviews", getSessionReviews);

/**
 * @route PATCH /api/v1/admin/sessions/:sessionId/status
 * @description Manually update the status of a session.
 * @access Admin
 */
router.patch("/:sessionId/status", updateSessionStatus);

/**
 * @route PATCH /api/v1/admin/sessions/:sessionId/block
 * @description Block or unblock a session.
 * @access Admin
 */
router.patch("/:sessionId/block", toggleSessionBlockStatus);

export default router;
