import express from "express";
import {
  getAllTransactions,
  getTransactionDetails,
  processRefund,
} from "../controller/admin.transaction.controller.js";
import { protect, isAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

// All routes in this file are protected and require admin privileges
router.use(protect, isAdmin);

/**
 * @route GET /api/v1/admin/transactions
 * @description Get a list of all transactions with filtering and pagination.
 * @access Admin
 */
router.get("/", getAllTransactions);

/**
 * @route GET /api/v1/admin/transactions/:transactionId
 * @description Get detailed information for a single transaction.
 * @access Admin
 */
router.get("/:transactionId", getTransactionDetails);

/**
 * @route POST /api/v1/admin/transactions/:transactionId/refund
 * @description Process a full or partial refund for a completed payment.
 * @access Admin
 */
router.post("/:transactionId/refund", processRefund);

export default router;
