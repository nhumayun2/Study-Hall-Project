import express from "express";
import { applyToBeTutor } from "../controller/tutor.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

/**
 * @route POST /api/v1/tutors/apply
 * @description The endpoint for a user to submit their detailed application to become a tutor.
 * @access Authenticated users
 */
router.post(
  "/apply",
  protect,
  // Use upload.fields to handle multiple, specifically named file uploads.
  // This perfectly matches the requirements you outlined.
  upload.fields([
    { name: "idFront", maxCount: 1 },
    { name: "idBack", maxCount: 1 },
    { name: "selfie", maxCount: 1 },
    { name: "supportingDocuments", maxCount: 5 }, // Allow up to 5 supporting documents
  ]),
  applyToBeTutor
);

export default router;
