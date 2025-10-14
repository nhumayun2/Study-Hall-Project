import express from "express";
import { protect, isAdmin } from "../middleware/auth.middleware.js";
import {
  createReport,
  getAllReports,
  updateReportStatus,
} from "../controller/report.controller.js";

const router = express.Router();

router.post("/", protect, createReport);
router.get("/all", protect, isAdmin, getAllReports);
router.patch("/status/:id", protect, isAdmin, updateReportStatus);

export default router;
