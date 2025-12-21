import express from "express";
import {
  getMyProfile,
  updateMyProfile,
  updateBeneficiaryInfo,
  addMinor,
  updateMinor,
  deleteMinor,
  getTutorPublicProfile,
  getAllActiveTutors, // <-- Import the new function
} from "../controller/user.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

// ====================================================================
// --- PUBLIC ROUTES ---
// ====================================================================
/**
 * @route GET /api/v1/users/tutor/:tutorId
 * @description Gets a tutor's public-facing profile.
 * @access Public
 */
router.get("/tutor/:tutorId", getTutorPublicProfile);

/**
 * @route GET /api/v1/users/tutors
 * @description (NEW) Gets a list of all active tutors with search/pagination.
 * @access Public
 */
router.get("/tutors", getAllActiveTutors);

// ====================================================================
// --- PROTECTED ROUTES ---
// ====================================================================
// All routes below this point require the user to be logged in.
router.use(protect);

// --- Profile Management Routes ---
router.get("/me", getMyProfile);
router.patch("/me/update", upload.single("avatar"), updateMyProfile);

// --- Beneficiary Information Route ---
router.patch("/me/beneficiary", updateBeneficiaryInfo);

// --- Minor Management Routes ---
router.post("/me/minors", addMinor);
router.patch("/me/minors/:minorId", updateMinor);
router.delete("/me/minors/:minorId", deleteMinor);

export default router;
