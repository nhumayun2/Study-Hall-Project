import express from "express";
import {
  getAllReports,
  getReportDetails,
  updateReportStatus,
  takeActionOnReport,
} from "../controller/admin.report.controller.js";
import { protect, isAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

// All routes in this file are protected and require admin privileges
router.use(protect, isAdmin);

/**
 * @route GET /api/v1/admin/reports
 * @description Get a list of all reports with filtering and pagination.
 * @access Admin
 */
router.get("/", getAllReports);

/**
 * @route GET /api/v1/admin/reports/:reportId
 * @description Get detailed information for a single report.
 * @access Admin
 */
router.get("/:reportId", getReportDetails);

/**
 * @route PATCH /api/v1/admin/reports/:reportId/status
 * @description Update the status of a report (e.g., to 'Resolved').
 * @access Admin
 */
router.patch("/:reportId/status", updateReportStatus);

/**
 * @route POST /api/v1/admin/reports/:reportId/action
 * @description Take a definitive action on a report (e.g., resolve and block content).
 * @access Admin
 */
router.post("/:reportId/action", takeActionOnReport);

export default router;
