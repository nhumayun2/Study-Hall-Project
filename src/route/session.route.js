import express from "express";
import {
  // Core Session Management
  getAllSessions,
  getSessionDetails,
  getMySessions,
  // Student Request Workflow
  createSessionRequest,
  acceptTutorOffer,
  // Tutor Offer Workflow
  createSessionOffer,
  bookSessionOffer,
  // Tutor Application Workflow
  applyToSessionRequest,
  // Payment Flow
  preauthorizeSessionPayment,
  // In-Session Actions
  cancelSession,
  studentGenerateCheckInQR,
  tutorScanCheckInQR,
  tutorGenerateCheckOutQR,
  studentScanCheckOutQR,
  // --- NEW DEBUGGING ROUTE ---
  adminManualCapture,
} from "../controller/session.controller.js";
import {
  protect,
  isStudent,
  isTutor,
  isAdmin, // Import isAdmin
} from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

// ====================================================================
// --- PUBLIC ROUTES (for browsing sessions) ---
// ====================================================================
router.get("/", getAllSessions);
router.get("/:sessionId", getSessionDetails);

// ====================================================================
// --- AUTHENTICATED USER ROUTES ---
// ====================================================================
router.get("/my-sessions", protect, getMySessions);
router.patch("/:sessionId/cancel", protect, cancelSession);

// ====================================================================
// --- STUDENT-SPECIFIC ROUTES ---
// ====================================================================
router.post("/request", protect, isStudent, createSessionRequest);
router.post("/offer/:sessionId/book", protect, isStudent, bookSessionOffer);
router.post(
  "/request/:sessionId/accept-tutor",
  protect,
  isStudent,
  acceptTutorOffer
);

// ====================================================================
// --- TUTOR-SPECIFIC ROUTES ---
// ====================================================================
router.post(
  "/offer",
  protect,
  isTutor,
  upload.single("coverPhoto"),
  createSessionOffer
);
router.post(
  "/request/:sessionId/apply",
  protect,
  isTutor,
  applyToSessionRequest
);

// ====================================================================
// --- PAYMENT & QR CODE FLOW ---
// ====================================================================

// Payment Pre-authorization
router.post(
  "/:sessionId/preauthorize-payment",
  protect,
  isStudent,
  preauthorizeSessionPayment
);

// QR Code Check-in
router.get(
  "/:sessionId/check-in/generate",
  protect,
  isStudent,
  studentGenerateCheckInQR
);
router.post("/check-in/scan", protect, isTutor, tutorScanCheckInQR);

// QR Code Check-out
router.get(
  "/:sessionId/check-out/generate",
  protect,
  isTutor,
  tutorGenerateCheckOutQR
);
router.post("/check-out/scan", protect, isStudent, studentScanCheckOutQR);

// ====================================================================
// --- NEW: ADMIN DEBUGGING ROUTE ---
// ====================================================================
/**
 * @route POST /api/v1/sessions/:sessionId/manual-capture
 * @description Manually captures payment and completes a session for debugging.
 * @access Admin
 */
router.post("/:sessionId/manual-capture", protect, isAdmin, adminManualCapture);

export default router;
