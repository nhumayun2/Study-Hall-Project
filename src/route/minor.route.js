import express from "express";
import {
  createMinor,
  getMyMinors,
  updateMinor,
  deleteMinor,
} from "../controller/minor.controller.js"; // <-- Import your new controller functions
import { protect } from "../middleware/auth.middleware.js"; // <-- Import the protection middleware

const router = express.Router();

// All minor routes require the user to be authenticated (logged in)
router.use(protect);

// 1. POST /minors - Create a new minor
router.post("/", createMinor);

// 2. GET /minors - Get all minors for the current user
router.get("/", getMyMinors);

// 3. PATCH /minors/:minorId - Update a specific minor
router.patch("/:minorId", updateMinor);

// 4. DELETE /minors/:minorId - Delete a specific minor
router.delete("/:minorId", deleteMinor);

export default router;
