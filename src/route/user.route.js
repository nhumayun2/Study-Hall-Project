import express from "express";
import {
  getMyProfile,
  updateMyProfile,
  updateBeneficiaryInfo, // <-- Import the new function
  addMinor,
  updateMinor,
  deleteMinor,
} from "../controller/user.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

// All routes in this file are protected and require the user to be logged in.
router.use(protect);

// --- Profile Management Routes ---
router.get("/me", getMyProfile);
router.patch("/me/update", upload.single("avatar"), updateMyProfile);

// --- NEW: Beneficiary Information Route ---
/**
 * @route PATCH /api/v1/users/me/beneficiary
 * @description Allows a user to update their payment/beneficiary info.
 * @access Authenticated (Tutor or LocationOwner)
 */
router.patch("/me/beneficiary", updateBeneficiaryInfo);

// --- Minor Management Routes ---
router.post("/me/minors", addMinor);
router.patch("/me/minors/:minorId", updateMinor);
router.delete("/me/minors/:minorId", deleteMinor);

export default router;
