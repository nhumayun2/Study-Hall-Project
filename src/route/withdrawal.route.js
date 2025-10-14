import express from "express";
import {
  requestWithdrawalUser,
  getUserWithdrawalHistory,
} from "../controller/withdrawal.controller.js";
import AppError from "../errors/AppError.js";
import {
  protect,
  isTutor,
  isLocationOwner,
} from "../middleware/auth.middleware.js";

const withdrawalRouter = express.Router();

// Middleware to ensure the user is either a Tutor OR a Location Owner
const isTutorOrLocationOwner = (req, res, next) => {
  if (req.user?.role !== "Tutor" && req.user?.role !== "LocationOwner") {
    console.log(req.user);
    throw new AppError(
      403,
      "Access denied. Only Tutors and Location Owners can request withdrawals."
    );
  }
  next();
};

// --- Apply general middleware to all withdrawal routes ---
withdrawalRouter.use(protect, isTutorOrLocationOwner);

/**
 * @route POST /api/v1/withdrawals/request
 * @desc Endpoint for Tutors/Location Owners to initiate a withdrawal request.
 */
withdrawalRouter.post("/request", requestWithdrawalUser);

/**
 * @route GET /api/v1/withdrawals/history
 * @desc Endpoint for Tutors/Location Owners to view their withdrawal history.
 */
withdrawalRouter.get("/history", getUserWithdrawalHistory);

export default withdrawalRouter;
