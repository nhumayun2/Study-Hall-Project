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
} from "../controller/session.controller.js";
import { protect, isStudent, isTutor } from "../middleware/auth.middleware.js";
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

export default router;
