import express from "express";
import {
  getAllUsers,
  getUserDetails,
  updateUserStatus,
} from "../controller/admin.user.controller.js";
import { protect, isAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

// All routes in this file are protected and require admin privileges
router.use(protect, isAdmin);

/**
 * @route GET /api/v1/admin/users
 * @description Get a list of all users with filtering and pagination.
 * @access Admin
 */
router.get("/", getAllUsers);

/**
 * @route GET /api/v1/admin/users/:userId
 * @description Get detailed information for a single user.
 * @access Admin
 */
router.get("/:userId", getUserDetails);

/**
 * @route PATCH /api/v1/admin/users/:userId/status
 * @description Update the status of a user (e.g., Active, Inactive, Blocked).
 * @access Admin
 */
router.patch("/:userId/status", updateUserStatus);

export default router;
