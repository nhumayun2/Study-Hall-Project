import express from "express";
import {
  requestWithdrawal,
  getMyWithdrawalHistory, // Corrected function name
} from "../controller/withdrawal.controller.js";
import AppError from "../errors/AppError.js";
import { protect } from "../middleware/auth.middleware.js";
import httpStatus from "http-status";

const router = express.Router();

// Middleware to ensure the user is either a Tutor or a Location Owner
const isTutorOrLocationOwner = (req, res, next) => {
  if (req.user?.role !== "Tutor" && req.user?.role !== "LocationOwner") {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Access denied. Only Tutors and Location Owners can access this feature."
    );
  }
  next();
};

// --- Apply general middleware to all withdrawal routes ---
router.use(protect, isTutorOrLocationOwner);

/**
 * @route POST /api/v1/withdrawals/request
 * @description Endpoint for Tutors/Location Owners to initiate a withdrawal request.
 */
router.post("/request", requestWithdrawal);

/**
 * @route GET /api/v1/withdrawals/my-history
 * @description Endpoint for Tutors/Location Owners to view their withdrawal history.
 */
router.get("/my-history", getMyWithdrawalHistory); // Corrected function call

export default router;
