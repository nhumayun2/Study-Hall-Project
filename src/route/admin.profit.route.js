import express from "express";
import {
  getProfitMetrics,
  getAllProfitTransactions,
  getProfitDetails,
} from "../controller/admin.profit.controller.js";
import { protect, isAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

// All routes in this file are protected and require admin privileges
router.use(protect, isAdmin);

/**
 * @route GET /api/v1/admin/profit/metrics
 * @description Get high-level profit metrics for the dashboard cards.
 * @access Admin
 */
router.get("/metrics", getProfitMetrics);

/**
 * @route GET /api/v1/admin/profit/transactions
 * @description Get a list of all profit-generating transactions (completed sessions).
 * @access Admin
 */
router.get("/transactions", getAllProfitTransactions);

/**
 * @route GET /api/v1/admin/profit/transactions/:sessionId
 * @description Get the detailed profit breakdown for a single completed session.
 * @access Admin
 */
router.get("/transactions/:sessionId", getProfitDetails);

export default router;
