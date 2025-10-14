import express from "express";
import {
  createCourse,
  getMyCourses,
  editCourse,
  deactivateCourse,
  deleteCourse,
  duplicateCourse,
  getTutorsAllCourses,
} from "../controller/tutor.course.controller.js";
import { protect, isTutor } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

router.get("/tutor/:tutorId/all", getTutorsAllCourses);

// ✅ Every route requires authentication
router.use(protect);

// ✅ Routes for all logged-in users (no role restriction)
router.get("/", getMyCourses);

// ✅ Routes for tutors only
router.post("/", isTutor, upload.single("coverPhoto"), createCourse);

router
  .route("/:courseId")
  .patch(isTutor, upload.single("coverPhoto"), editCourse)
  .delete(isTutor, deleteCourse);

router.patch("/:courseId/deactivate", isTutor, deactivateCourse);
router.post("/:courseId/duplicate", isTutor, duplicateCourse);

export default router;
