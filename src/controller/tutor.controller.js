import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { User } from "../model/user.model.js";
import { TutorApplication } from "../model/tutorApplication.model.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";

/**
 * @description USER applies to become a Tutor.
 * @route POST /api/v1/tutors/apply
 * @access Authenticated User (Student)
 */
export const applyToBeTutor = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { educationLevel, major, categories, experience, bio } = req.body;

  // 1. Check if the user is already a tutor or has a pending application
  if (req.user.role === "Tutor") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You are already a registered tutor."
    );
  }
  const pendingApplication = await TutorApplication.findOne({
    user: userId,
    status: "Pending",
  });
  if (pendingApplication) {
    throw new AppError(
      httpStatus.CONFLICT,
      "You already have a pending application under review."
    );
  }

  // 2. Handle file uploads for KYC documents
  if (
    !req.files ||
    !req.files.idFront ||
    !req.files.idBack ||
    !req.files.selfie
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Please upload all required documents: ID front, ID back, and a selfie."
    );
  }

  const [idFrontResult, idBackResult, selfieResult] = await Promise.all([
    uploadOnCloudinary(req.files.idFront[0].buffer),
    uploadOnCloudinary(req.files.idBack[0].buffer),
    uploadOnCloudinary(req.files.selfie[0].buffer),
  ]);

  // 3. Create the application document
  const newApplication = await TutorApplication.create({
    user: userId,
    educationLevel,
    major,
    categoriesToTeach: categories, // Assuming 'categories' from body maps to this
    experience,
    bio,
    kycDocuments: {
      idFront: {
        public_id: idFrontResult.public_id,
        url: idFrontResult.secure_url,
      },
      idBack: {
        public_id: idBackResult.public_id,
        url: idBackResult.secure_url,
      },
      selfie: {
        public_id: selfieResult.public_id,
        url: selfieResult.secure_url,
      },
    },
    status: "Pending",
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message:
      "Your application to become a tutor has been submitted successfully. It is now under review by our admin team.",
    data: newApplication,
  });
});
