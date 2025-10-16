import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { User } from "../model/user.model.js";
import { TutorApplication } from "../model/tutorApplication.model.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";

/**
 * @description USER applies to become a Tutor by submitting a detailed application.
 * @route POST /api/v1/tutors/apply
 * @access Authenticated User
 */
export const applyToBeTutor = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const {
    bio,
    occupation,
    educationLevel,
    major,
    experience,
    categoriesToTeach,
    idType,
  } = req.body;

  // --- 1. VALIDATION ---
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
  if (
    !req.files ||
    !req.files.idFront ||
    !req.files.idBack ||
    !req.files.selfie
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "ID Front, ID Back, and Selfie images are required."
    );
  }

  // --- 2. PROCESS FILE UPLOADS ---
  // Process KYC images
  const [idFrontResult, idBackResult, selfieResult] = await Promise.all([
    uploadOnCloudinary(req.files.idFront[0].buffer),
    uploadOnCloudinary(req.files.idBack[0].buffer),
    uploadOnCloudinary(req.files.selfie[0].buffer),
  ]);

  // Process supporting documents (if any)
  let supportingDocsData = [];
  if (
    req.files.supportingDocuments &&
    req.files.supportingDocuments.length > 0
  ) {
    supportingDocsData = await Promise.all(
      req.files.supportingDocuments.map(async (file) => {
        const result = await uploadOnCloudinary(file.buffer);
        return { public_id: result.public_id, url: result.secure_url };
      })
    );
  }

  // --- 3. CREATE THE APPLICATION DOCUMENT ---
  const newApplication = await TutorApplication.create({
    user: userId,
    bio,
    occupation,
    educationLevel,
    major,
    experience,
    categoriesToTeach: JSON.parse(categoriesToTeach), // Categories are sent as a JSON string array
    kycDocuments: {
      idType,
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
    supportingDocuments: supportingDocsData,
    status: "Pending",
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message:
      "Your application to become a tutor has been submitted successfully.",
    data: newApplication,
  });
});
