import express from "express";
import {
  getAllCoursesAdmin,
  getCourseDetailsAdmin,
  blockCourseAdmin,
  unblockCourseAdmin,
  getCourseSessionsAdmin,
} from "../controller/admin.course.controller.js"; // Import the course controller

const router = express.Router();

// NOTE: Middleware is applied in the parent admin.route.js file.
// -------------------------------------------------------------
// COURSE MANAGEMENT ROUTES
// -------------------------------------------------------------

// @route GET /api/v1/admin/courses
// @desc Get list of all courses with filtering/pagination for admin panel
router.route("/").get(getAllCoursesAdmin);

// @route GET /api/v1/admin/courses/:courseId/details
// @desc Get detailed information for a specific course
router.route("/:courseId/details").get(getCourseDetailsAdmin);

// @route GET /api/v1/admin/courses/:courseId/sessions
// @desc Get all sessions associated with a specific course (used in course detail view)
router.route("/:courseId/sessions").get(getCourseSessionsAdmin);

// @route PATCH /api/v1/admin/courses/:courseId/block
// @desc Block a specific course
router.route("/:courseId/block").patch(blockCourseAdmin);

// @route PATCH /api/v1/admin/courses/:courseId/unblock
// @desc Unblock a specific course
router.route("/:courseId/unblock").patch(unblockCourseAdmin);

export default router;
