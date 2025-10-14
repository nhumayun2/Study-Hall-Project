import express from "express";
import {
  getAllLocations,
  getLocationDetails,
  getLocationSessionHistory,
  approveLocation,
  rejectLocation,
  toggleLocationActiveStatus,
} from "../controller/admin.location.controller.js";
import { protect, isAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

// All routes in this file are protected and require admin privileges
router.use(protect, isAdmin);

/**
 * @route GET /api/v1/admin/locations
 * @description Get a list of all locations with filtering and pagination.
 * @access Admin
 */
router.get("/", getAllLocations);

/**
 * @route GET /api/v1/admin/locations/:locationId
 * @description Get detailed information for a single location.
 * @access Admin
 */
router.get("/:locationId", getLocationDetails);

/**
 * @route GET /api/v1/admin/locations/:locationId/history
 * @description Get the session history for a specific location.
 * @access Admin
 */
router.get("/:locationId/history", getLocationSessionHistory);

/**
 * @route PATCH /api/v1/admin/locations/:locationId/approve
 * @description Approve a pending location.
 * @access Admin
 */
router.patch("/:locationId/approve", approveLocation);

/**
 * @route PATCH /api/v1/admin/locations/:locationId/reject
 * @description Reject a pending location.
 * @access Admin
 */
router.patch("/:locationId/reject", rejectLocation);

/**
 * @route PATCH /api/v1/admin/locations/:locationId/toggle-active
 * @description Deactivate or reactivate an approved location.
 * @access Admin
 */
router.patch("/:locationId/toggle-active", toggleLocationActiveStatus);

export default router;
