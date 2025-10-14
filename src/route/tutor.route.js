import express from "express";
import { applyToBeTutor } from "../controller/tutor.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

/**
 * @route POST /api/v1/tutors/apply
 * @description The endpoint for a user to submit their application to become a tutor.
 * @access Authenticated users (typically Students)
 */
router.post(
  "/apply",
  protect,
  // Use upload.fields to handle multiple, specifically named file uploads
  upload.fields([
    { name: "idFront", maxCount: 1 },
    { name: "idBack", maxCount: 1 },
    { name: "selfie", maxCount: 1 },
  ]),
  applyToBeTutor
);

// Note: Routes for an admin to GET applications are in admin.routes.js, not here.
// Routes for a tutor to manage their own profile are in user.routes.js.
// This file is solely for the application process.

export default router;
