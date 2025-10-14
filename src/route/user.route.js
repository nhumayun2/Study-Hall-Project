import express from "express";
import {
  getMyProfile,
  updateMyProfile,
  addMinor,
  updateMinor,
  deleteMinor,
} from "../controller/user.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

// --- Profile Management Routes ---
router.get("/me", protect, getMyProfile); // Renamed route for clarity
router.patch(
  "/me/update", // Renamed route for clarity
  protect,
  upload.single("avatar"),
  updateMyProfile
);

// --- Minor Management Routes ---
// These routes are new and correspond to the functions we added to user.controller.js
router.post("/me/minors", protect, addMinor);
router.patch("/me/minors/:minorId", protect, updateMinor);
router.delete("/me/minors/:minorId", protect, deleteMinor);

// The '/change-password' route has been removed from this file.
// It is now correctly located in 'auth.route.js'.

export default router;
