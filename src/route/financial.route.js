import express from "express";
import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import { protect, isStudent } from "../middleware/auth.middleware.js";
import {
  createPaymentIntentForSession,
  requestWithdrawal,
  getFinancialOverview,
  getTransactionHistory,
} from "../controller/financial.controller.js";

const router = express.Router();

// Middleware to ensure the user is either a Tutor OR a Location Owner
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

// ====================================================================
// --- STUDENT PAYMENT ROUTES ---
// ====================================================================

/**
 * @route POST /api/v1/financials/sessions/:sessionId/create-payment-intent
 * @description Creates a Stripe Payment Intent to pre-authorize payment for a session.
 * @access Student
 */
router.post(
  "/sessions/:sessionId/create-payment-intent",
  protect,
  isStudent,
  createPaymentIntentForSession
);

// ====================================================================
// --- TUTOR/LOCATION OWNER ROUTES ---
// ====================================================================

/**
 * @route POST /api/v1/financials/request-withdrawal
 * @description A Tutor or Location Owner requests to withdraw funds from their wallet.
 * @access Tutor, LocationOwner
 */
router.post(
  "/request-withdrawal",
  protect,
  isTutorOrLocationOwner,
  requestWithdrawal
);

// ====================================================================
// --- GENERAL AUTHENTICATED ROUTES ---
// ====================================================================

/**
 * @route GET /api/v1/financials/overview
 * @description Gets the financial overview (wallet, recent transactions) for the logged-in user.
 * @access Authenticated
 */
router.get("/overview", protect, getFinancialOverview);

/**
 * @route GET /api/v1/financials/transactions
 * @description Gets the transaction history for the logged-in user with pagination.
 * @access Authenticated
 */
router.get("/transactions", protect, getTransactionHistory);

export default router;
