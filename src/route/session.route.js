import express from "express";
import {
  // Core Session Management
  getAllSessions,
  getSessionDetails,
  getMySessions,
  getMyCalendarSessions,
  // Student Request Workflow
  createSessionRequest,
  acceptTutorOffer,
  // Tutor Offer Workflow
  createSessionOffer,
  bookSessionOffer,
  // Tutor Application Workflow
  applyToSessionRequest,
  withdrawOffer,
  // Payment Flow
  preauthorizeSessionPayment,
  // In-Session Actions
  cancelSession,
  studentGenerateCheckInQR,
  tutorScanCheckInQR,
  tutorGenerateCheckOutQR,
  studentScanCheckOutQR,
  // Admin Debugging Route
  adminManualCapture,
  // --- NEW ACTIONS ---
  updateSession,
  deleteSession,
  duplicateSession,
} from "../controller/session.controller.js";
import {
  protect,
  isStudent,
  isTutor,
  isAdmin,
} from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

// ====================================================================
// --- PUBLIC ROUTES (for browsing sessions) ---
// ====================================================================
router.get("/", getAllSessions);

// ====================================================================
// --- AUTHENTICATED USER ROUTES ---
// ====================================================================

router.get("/my-sessions", protect, getMySessions);
router.get("/my-calendar", protect, getMyCalendarSessions); // Accessible to all logged-in users

router.patch("/:sessionId/cancel", protect, cancelSession); // General cancel for booked sessions

// --- NEW: EDIT AND DELETE (for session creators) ---
// These routes are protected and check for creator ownership in the controller
router.patch(
  "/:sessionId/edit",
  protect,
  upload.single("coverPhoto"), // Allow photo upload during edit
  updateSession
);
router.delete("/:sessionId", protect, deleteSession); // General delete for unbooked sessions

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

router.patch("/request/:sessionId/withdraw", protect, isTutor, withdrawOffer);

// --- NEW: DUPLICATE (Tutor only) ---
router.post("/:sessionId/duplicate", protect, isTutor, duplicateSession);

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
// --- ADMIN DEBUGGING ROUTE ---
// ====================================================================
router.post("/:sessionId/manual-capture", protect, isAdmin, adminManualCapture);

// ====================================================================
// --- PARAMETERIZED ROUTE (MUST BE LAST for GET) ---
// ====================================================================
router.get("/:sessionId", getSessionDetails);

export default router;
