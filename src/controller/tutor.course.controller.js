import httpStatus from "http-status";
import { Course } from "../model/course.model.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import mongoose from "mongoose"; // <-- Added mongoose import

// export const createCourse = catchAsync(async (req, res) => {
//   const {
//     title,
//     description,
//     sessionCategory,
//     sessionSubCategory,
//     tags,
//     tuitionFee,
//     students,
//     duration,
//     sessionDate,
//     sessionTime,
//     cancellationPolicy,
//     tutorNote,
//     isOnline,
//     location,
//     stateLocation,
//     cityLocation,
//   } = req.body;

//   const file = req.file;
//   if (!file) {
//     throw new AppError(httpStatus.BAD_REQUEST, "Cover photo is required");
//   }

//   const result = await uploadOnCloudinary(file.buffer);

//   const newCourse = await Course.create({
//     tutor: req.user._id,
//     title,
//     description,
//     sessionCategory,
//     sessionSubCategory,
//     tags: tags ? JSON.parse(tags) : [],
//     tuitionFee,
//     students,
//     duration,
//     sessionDate,
//     sessionTime,
//     cancellationPolicy,
//     tutorNote,
//     isOnline,
//     location,
//     stateLocation,
//     cityLocation,
//     coverPhoto: {
//       public_id: result.public_id,
//       url: result.secure_url,
//     },
//   });

//   sendResponse(res, {
//     statusCode: httpStatus.CREATED,
//     success: true,
//     message: "Course created successfully",
//     data: newCourse,
//   });
// });

// Get all courses for the logged-in tutor
export const createCourse = catchAsync(async (req, res) => {
  const {
    title,
    description,
    sessionCategory,
    sessionSubCategory,
    tags,
    tuitionFee,
    students,
    duration,
    sessionDate,
    sessionTime,
    cancellationPolicy,
    tutorNote,
    isOnline,
    location,
    stateLocation,
    cityLocation,
  } = req.body;

  const file = req.file;
  if (!file) {
    throw new AppError(httpStatus.BAD_REQUEST, "Cover photo is required");
  }

  // upload to cloudinary
  const result = await uploadOnCloudinary(file.buffer);

  // safe tags parsing
  let parsedTags = [];
  if (tags) {
    try {
      parsedTags = JSON.stringify(tags);
    } catch (err) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Tags must be a valid JSON array"
      );
    }
  }

  const newCourse = await Course.create({
    tutor: req.user._id,
    title,
    description,
    sessionCategory,
    sessionSubCategory,
    tags: parsedTags,
    tuitionFee,
    students,
    duration,
    sessionDate,
    sessionTime,
    cancellationPolicy,
    tutorNote,
    isOnline,
    location,
    stateLocation,
    cityLocation,
    coverPhoto: {
      public_id: result.public_id,
      url: result.secure_url,
    },
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Course created successfully",
    data: newCourse,
  });
});

export const getTutorsAllCourses = catchAsync(async (req, res) => {
  const { tutorId } = req.params;

  const courses = await Course.find({ tutor: tutorId }).populate(
    "category subCategory location"
  );

  if (!courses || courses.length === 0) {
    return sendResponse(res, {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: "No courses found for this tutor",
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Tutor's courses fetched successfully",
    data: courses,
  });
});

export const getMyCourses = catchAsync(async (req, res) => {
  const courses = await Course.find({ tutor: req.user._id })
    .populate("category", "name icon")
    .populate("subCategory", "name category")
    .populate("location", "name address owner");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Tutor's courses fetched successfully",
    data: courses,
  });
});

// Edit a course
export const editCourse = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const updates = req.body;
  const file = req.file;

  const course = await Course.findOne({ _id: courseId, tutor: req.user._id });

  if (!course) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Course not found or you are not the owner"
    );
  }

  if (file) {
    const result = await uploadOnCloudinary(file.buffer);
    updates.coverPhoto = {
      public_id: result.public_id,
      url: result.secure_url,
    };
  } // Update only the provided fields

  Object.keys(updates).forEach((key) => {
    if (updates[key]) {
      if (key === "tags") {
        course[key] = JSON.parse(updates[key]);
      } else {
        course[key] = updates[key];
      }
    }
  });

  await course.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Course updated successfully",
    data: course,
  });
});

// Deactivate a course
export const deactivateCourse = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const course = await Course.findOneAndUpdate(
    { _id: courseId, tutor: req.user._id },
    { status: "deactivated" },
    { new: true }
  );

  if (!course) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Course not found or you are not the owner"
    );
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Course deactivated successfully",
    data: course,
  });
});

// Delete a course
export const deleteCourse = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const course = await Course.findOneAndDelete({
    _id: courseId,
    tutor: req.user._id,
  });

  if (!course) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Course not found or you are not the owner"
    );
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Course deleted successfully",
    data: course,
  });
});

// Duplicate a course
export const duplicateCourse = catchAsync(async (req, res) => {
  const { courseId } = req.params;
  const originalCourse = await Course.findOne({
    _id: courseId,
    tutor: req.user._id,
  });

  if (!originalCourse) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Course not found or you are not the owner"
    );
  }

  const duplicatedCourse = new Course({
    ...originalCourse.toObject(),
    _id: new mongoose.Types.ObjectId(),
    title: `${originalCourse.title} (Copy)`,
    status: "Active",
  });

  await duplicatedCourse.save();

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Course duplicated successfully",
    data: duplicatedCourse,
  });
});
