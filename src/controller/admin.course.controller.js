import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import AppError from "../errors/AppError.js";
import { Course } from "../model/course.model.js";
import { Session } from "../model/session.model.js";
import { User } from "../model/user.model.js";

// Utility function to track history (placeholder, assuming you have a CourseHistory model)
const createCourseHistory = async (
  courseId,
  adminId,
  action,
  reason = null
) => {
  // For now console only. Will Implement later.
  console.log(
    `[COURSE HISTORY] Admin ${adminId} performed '${action}' on Course ${courseId}. Reason: ${reason}`
  ); // Example logic to save history: // await CourseHistory.create({ course: courseId, admin: adminId, action, reason });
};

/**
 * @desc Admin: Get all courses with filtering, searching, and pagination
 * @route GET /api/v1/admin/courses
 * @access Admin
 * Used for the main 'Courses' tab list view in Admin Panel.
 */
export const getAllCoursesAdmin = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, search, status } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const query = {}; // Filter by status (e.g., Active, Blocked) - assumes 'isBlocked' field exists on Course Model

  if (status === "Blocked") {
    query.isBlocked = true;
  } else if (status === "Active") {
    query.isBlocked = false;
  } // Search filter (Search by Course Title)

  if (search) {
    query.title = { $regex: search, $options: "i" };
  }

  const totalCourses = await Course.countDocuments(query);
  const courses = await Course.find(query)
    .populate("tutor", "name email")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit)); // Format data for admin dashboard table view

  const formattedCourses = await Promise.all(
    courses.map(async (course) => {
      const sessionCount = await Session.countDocuments({ course: course._id });
      return {
        id: course._id,
        title: course.title,
        createdBy: course.tutor ? course.tutor.name : "N/A",
        type: course.isPrivate ? "Private" : "Public", // Assuming a field 'isPrivate' exists
        totalSessions: sessionCount,
        status: course.isBlocked ? "Blocked" : "Active", // Assumes 'isBlocked' field exists
      };
    })
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "All courses retrieved successfully for Admin Panel.",
    data: {
      courses: formattedCourses,
      total: totalCourses,
      page: parseInt(page),
      limit: parseInt(limit),
    },
  });
});

/**
 * @desc Admin: Get details of a single course
 * @route GET /api/v1/admin/courses/:courseId/details
 * @access Admin
 * Used for the 'View Details' page of a course.
 */
export const getCourseDetailsAdmin = catchAsync(async (req, res) => {
  const { courseId } = req.params;

  const course = await Course.findById(courseId)
    .populate("tutor", "name email")
    .lean();

  if (!course) {
    throw new AppError(httpStatus.NOT_FOUND, "Course not found.");
  }

  const sessionCount = await Session.countDocuments({ course: courseId });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Course details retrieved successfully.",
    data: {
      ...course,
      totalSessions: sessionCount,
    },
  });
});

/**
 * @desc Admin: Block a course
 * @route PATCH /api/v1/admin/courses/:courseId/block
 * @access Admin
 */
export const blockCourseAdmin = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const { reason } = req.body;
  const adminId = req.user._id;

  if (!reason || reason.trim().length < 10) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "A detailed reason (min 10 characters) is required to block a course."
    );
  }

  const course = await Course.findByIdAndUpdate(
    courseId,
    {
      isBlocked: true,
      blockReason: reason,
      blockedBy: adminId,
      blockedAt: new Date(),
    },
    { new: true }
  );

  if (!course) {
    throw new AppError(httpStatus.NOT_FOUND, "Course not found.");
  }

  await createCourseHistory(courseId, adminId, "Blocked", reason);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Course '${course.title}' has been blocked.`,
    data: course,
  });
});

/**
 * @desc Admin: Unblock a course
 * @route PATCH /api/v1/admin/courses/:courseId/unblock
 * @access Admin
 */
export const unblockCourseAdmin = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const adminId = req.user._id;

  const course = await Course.findByIdAndUpdate(
    courseId,
    { isBlocked: false, blockReason: null, blockedBy: null, blockedAt: null },
    { new: true }
  );

  if (!course) {
    throw new AppError(httpStatus.NOT_FOUND, "Course not found.");
  }

  await createCourseHistory(courseId, adminId, "Unblocked");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Course '${course.title}' has been unblocked.`,
    data: course,
  });
});

/**
 * @desc Admin: Get all sessions associated with a specific course
 * @route GET /api/v1/admin/courses/:courseId/sessions
 * @access Admin
 * Used within the Course Details view to show history.
 */
export const getCourseSessionsAdmin = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit); // Check if the course exists first

  const courseExists = await Course.findById(courseId);
  if (!courseExists) {
    throw new AppError(httpStatus.NOT_FOUND, "Course not found.");
  }

  const sessions = await Session.find({ course: courseId })
    .populate("student", "name email")
    .populate("tutor", "name email")
    .sort({ scheduledTime: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const totalSessions = await Session.countDocuments({ course: courseId });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Sessions for course retrieved successfully.",
    data: {
      sessions,
      total: totalSessions,
      page: parseInt(page),
      limit: parseInt(limit),
    },
  });
});
