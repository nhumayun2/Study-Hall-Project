import httpStatus from "http-status";
import { Course } from "../model/course.model.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { Category } from "../model/category.model.js";
import { SubCategory } from "../model/subCategory.model.js";
import { User } from "../model/user.model.js";

export const enrollInCourse = catchAsync(async (req, res, next) => {
  const { courseId } = req.params;
  const studentId = req.user._id; // Assuming user is authenticated and ID is available via middleware

  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    return next(new AppError(httpStatus.BAD_REQUEST, "Invalid Course ID."));
  }

  // 1. Find the course and check its status
  const course = await Course.findById(courseId);

  if (!course) {
    return next(new AppError(httpStatus.NOT_FOUND, "Course not found."));
  }

  if (course.status !== "Active") {
    return next(
      new AppError(
        httpStatus.BAD_REQUEST,
        "This course is not currently open for enrollment."
      )
    );
  }

  // 2. Check if the student is already enrolled
  const studentAlreadyEnrolled = course.enrolledStudents.some(
    (id) => id.toString() === studentId.toString()
  );

  if (studentAlreadyEnrolled) {
    return next(
      new AppError(
        httpStatus.CONFLICT,
        "You are already enrolled in this course."
      )
    );
  }

  // 3. Check for maximum capacity (if maxStudents > 0)
  if (
    course.maxStudents > 0 &&
    course.enrolledStudents.length >= course.maxStudents
  ) {
    return next(
      new AppError(
        httpStatus.BAD_REQUEST,
        "The course has reached its maximum enrollment capacity."
      )
    );
  }

  // 4. Enrollment Logic
  // For courses with a fee > 0, you would typically integrate Stripe here,
  // but for a simple enrollment feature, we assume payment is handled separately
  // or the course is free/payment is collected later.

  // Add the student's ID to the enrolledStudents array
  course.enrolledStudents.push(studentId);
  await course.save();

  res.status(httpStatus.OK).json({
    success: true,
    message: "Successfully enrolled in the course.",
    data: {
      courseId: course._id,
      studentId: studentId,
      newEnrollmentCount: course.enrolledStudents.length,
    },
  });
});

export const getAllCourses = catchAsync(async (req, res) => {
  const {
    searchTerm,
    category,
    subCategory,
    location,
    minFee,
    maxFee,
    rating,
  } = req.query;
  const query = {};

  if (searchTerm) {
    query.$or = [
      { title: { $regex: searchTerm, $options: "i" } },
      { description: { $regex: searchTerm, $options: "i" } },
      { tags: { $in: [searchTerm] } },
    ];
  }

  if (category) {
    const categoryDoc = await Category.findOne({ name: category });
    if (categoryDoc) {
      query.category = categoryDoc._id;
    }
  }

  if (subCategory) {
    const subCategoryDoc = await SubCategory.findOne({ name: subCategory });
    if (subCategoryDoc) {
      query.subCategory = subCategoryDoc._id;
    }
  }

  if (location) {
    query.location = location;
  }

  if (minFee || maxFee) {
    query.feePerStudent = {};
    if (minFee) {
      query.feePerStudent.$gte = parseFloat(minFee);
    }
    if (maxFee) {
      query.feePerStudent.$lte = parseFloat(maxFee);
    }
  }

  // Find courses by their tutor's rating
  if (rating) {
    const minRating = parseFloat(rating);
    const tutorsWithRating = await User.find({
      rating: { $gte: minRating },
      role: "Tutor",
    }).select("_id");
    query.tutor = { $in: tutorsWithRating.map((tutor) => tutor._id) };
  }

  const courses = await Course.find(query)
    .populate("tutor", "name avatar rating totalReviews")
    .populate("category", "name")
    .populate("subCategory", "name")
    .populate("location", "name address noiseLevel");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Courses fetched successfully",
    data: courses,
  });
});

export const getCourseDetails = catchAsync(async (req, res) => {
  const { id } = req.params;
  const course = await Course.findById(id)
    .populate("tutor", "name avatar rating totalReviews")
    .populate("category", "name")
    .populate("subCategory", "name")
    .populate("location", "name address noiseLevel");

  if (!course) {
    throw new AppError(httpStatus.NOT_FOUND, "Course not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Course details fetched successfully",
    data: course,
  });
});
