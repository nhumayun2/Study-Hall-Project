import express from "express";
import {
  getAllWithdrawalsAdmin,
  getWithdrawalDetailsAdmin,
  approveWithdrawalAdmin,
  rejectWithdrawalAdmin,
} from "../controller/withdrawal.controller.js";
import { protect, isAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

// All routes in this file are protected and require admin privileges
router.use(protect, isAdmin);

/**
 * @route GET /api/v1/admin/withdrawals
 * @description Get a list of all withdrawal requests with filtering.
 * @access Admin
 */
router.get("/", getAllWithdrawalsAdmin);

/**
 * @route GET /api/v1/admin/withdrawals/:withdrawalId
 * @description Get the details of a single withdrawal request.
 * @access Admin
 */
router.get("/:withdrawalId", getWithdrawalDetailsAdmin);

/**
 * @route PATCH /api/v1/admin/withdrawals/:withdrawalId/approve
 * @description Approve a withdrawal request and initiate the payout.
 * @access Admin
 */
router.patch("/:withdrawalId/approve", approveWithdrawalAdmin);

/**
 * @route PATCH /api/v1/admin/withdrawals/:withdrawalId/reject
 * @description Reject a withdrawal request.
 * @access Admin
 */
router.patch("/:withdrawalId/reject", rejectWithdrawalAdmin);

export default router;
