import express from "express";
import {
  changePassword,
  forgetPassword,
  login,
  logout,
  refreshToken,
  register,
  resetPassword,
  socialLogin,
  verifyEmail,
} from "../controller/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

// --- Core Authentication Routes ---
router.post("/register", register);
router.post("/login", login);
router.post("/social-login", socialLogin);
router.post("/verify-email", verifyEmail); // Renamed for clarity from '/verify'

// --- Password Management ---
router.post("/forget-password", forgetPassword); // Renamed for clarity from '/forget'
router.post("/reset-password", resetPassword);
router.patch("/change-password", protect, changePassword);

// --- Token Management & Logout ---
router.post("/refresh-token", refreshToken);
router.post("/logout", protect, logout);

// The old '/verify-otp' route is removed as its logic is now inside '/reset-password'.

export default router;
