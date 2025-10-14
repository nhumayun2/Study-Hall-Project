import express from "express";
import {
  getAllCourses,
  getCourseDetails,
  enrollInCourse,
} from "../controller/course.controller.js";
import { protect, isStudent } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", getAllCourses);

router.get("/:id", getCourseDetails);

router.post(
  "/enroll/:courseId",
  protect,
  isStudent, // Only students can enroll
  enrollInCourse
);

export default router;
