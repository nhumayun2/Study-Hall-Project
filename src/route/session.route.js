import express from "express";
import {
  // Core Session Management
  getAllSessions,
  getSessionDetails,
  getMySessions,
  getMyCalendarSessions,
  getSessionsByTutor, // <-- Import the new function
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
  studentGenerateCheckOutQR,
  tutorScanQR,
  // Admin Debugging Route
  adminManualCapture,
  // Edit/Delete/Duplicate
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
//this is added

// --- NEW: GET ALL SESSIONS FOR A SPECIFIC TUTOR ---
router.get("/tutor/:tutorId", getSessionsByTutor);
// --- END NEW ROUTE ---

// ====================================================================
// --- AUTHENTICATED USER ROUTES ---
// ====================================================================

router.get("/my-sessions", protect, getMySessions);
router.get("/my-calendar", protect, getMyCalendarSessions);
router.patch("/:sessionId/cancel", protect, cancelSession);

router.patch(
  "/:sessionId/edit",
  protect,
  upload.any(), // Use upload.any() for form-data flexibility
  updateSession
);
router.delete("/:sessionId", protect, deleteSession);

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
  upload.any(), // Use upload.any() for form-data flexibility
  createSessionOffer
);
router.post(
  "/request/:sessionId/apply",
  protect,
  isTutor,
  applyToSessionRequest
);

router.patch("/request/:sessionId/withdraw", protect, isTutor, withdrawOffer);

router.post("/:sessionId/duplicate", protect, isTutor, duplicateSession);

// ====================================================================
// --- PAYMENT & QR CODE FLOW (NEW REFACTORED FLOW) ---
// ====================================================================

// Payment Pre-authorization (Student)
router.post(
  "/:sessionId/preauthorize-payment",
  protect,
  isStudent,
  preauthorizeSessionPayment
);

// Student Generates Check-in QR
router.get(
  "/:sessionId/check-in/generate",
  protect,
  isStudent,
  studentGenerateCheckInQR
);

// Student Generates Check-out QR
router.get(
  "/:sessionId/check-out/generate",
  protect,
  isStudent,
  studentGenerateCheckOutQR
);

// Tutor Scans EITHER Check-in or Check-out QR
router.post("/scan-qr", protect, isTutor, tutorScanQR);

// ====================================================================
// --- ADMIN DEBUGGING ROUTE ---
// ====================================================================
router.post("/:sessionId/manual-capture", protect, isAdmin, adminManualCapture);

// ====================================================================
// --- PARAMETERIZED ROUTE (MUST BE LAST for GET) ---
// ====================================================================
// This route must come *after* specific GET routes like /my-sessions, /my-calendar, and /tutor/:tutorId
router.get("/:sessionId", getSessionDetails);

export default router;
