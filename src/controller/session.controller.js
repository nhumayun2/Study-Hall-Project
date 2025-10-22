import httpStatus from "http-status";
import mongoose from "mongoose";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { Session } from "../model/session.model.js";
import { User } from "../model/user.model.js";
import { Location } from "../model/location.model.js";
import { Transaction } from "../model/transaction.model.js";
import { Settings } from "../model/settings.model.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import { createToken, verifyToken } from "../utils/authToken.js";
import {
  capturePaymentIntent,
  releasePaymentIntent,
  createPaymentIntent,
  confirmPaymentIntent,
} from "../utils/Stripe.service.js";
import QRCode from "qrcode";

// Configuration for the QR Token
const CHECK_TOKEN_SECRET =
  process.env.QR_TOKEN_SECRET || "a_very_secret_key_for_qr";
const CHECK_TOKEN_EXPIRE = "5m"; // 5 minutes validity for security

// ====================================================================
// --- PAYMENT UTILITIES (INTERNAL TO THIS CONTROLLER) ---
// ====================================================================

/**
 * @description Utility to capture a pre-authorized payment via Stripe.
 */
const _captureSessionPayment = async (session) => {
  if (!session.paymentIntentId) return;

  try {
    // 1. Capture the payment via Stripe
    await capturePaymentIntent(session.paymentIntentId);

    const numberOfAttendees = session.enrolledStudents.length || 1;

    // 2. Create a transaction record for auditing
    await Transaction.create({
      user: session.creator,
      type: "Payment",
      amount: session.price * numberOfAttendees,
      status: "Completed",
      paymentGatewayId: session.paymentIntentId,
      description: `Payment captured for session: ${session.title}`,
      relatedSession: session._id,
    });

    // 3. Update Tutor's wallet using atomic increment
    if (session.acceptedTutor && session.tutorEarnings > 0) {
      await User.findByIdAndUpdate(session.acceptedTutor, {
        $inc: { "wallet.balance": session.tutorEarnings },
      });
      console.log(
        `Instructed DB to increment tutor wallet by ${session.tutorEarnings}`
      );
    }

    // 4. Update Location Owner's wallet using atomic increment
    const location = await Location.findById(session.location);
    if (location && location.owner && session.locationOwnerEarnings > 0) {
      await User.findByIdAndUpdate(location.owner, {
        $inc: { "wallet.balance": session.locationOwnerEarnings },
      });
      console.log(
        `Instructed DB to increment owner wallet by ${session.locationOwnerEarnings}`
      );
    }
  } catch (error) {
    console.error("Stripe Payment Capture or Wallet Update Failed:", error);
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Payment processing failed: ${error.message}.`
    );
  }
};

// --- PROFIT CALCULATION LOGIC ---
const _calculateAndAssignProfits = async (session) => {
  if (session.price > 0) {
    try {
      const settings = await Settings.getSettings();
      const numberOfAttendees = Math.max(
        session.enrolledStudents?.length || 0,
        1
      );
      const totalAmount = session.price * numberOfAttendees;

      const platformRate = settings.profitDistribution.platform / 100;
      const tutorRate = settings.profitDistribution.tutor / 100;
      const locationOwnerRate = settings.profitDistribution.locationOwner / 100;

      session.adminCommission = parseFloat(
        (totalAmount * platformRate).toFixed(2)
      );
      session.tutorEarnings = parseFloat((totalAmount * tutorRate).toFixed(2));
      session.locationOwnerEarnings = parseFloat(
        (totalAmount * locationOwnerRate).toFixed(2)
      );
    } catch (error) {
      console.error("Error calculating profit distribution:", error);
      session.adminCommission = 0;
      session.tutorEarnings = 0;
      session.locationOwnerEarnings = 0;
    }
  } else {
    session.adminCommission = 0;
    session.tutorEarnings = 0;
    session.locationOwnerEarnings = 0;
  }
};

// ====================================================================
// --- STUDENT: SESSION REQUEST WORKFLOW ---
// ====================================================================

/**
 * @description STUDENT creates a request for a session they need.
 */
export const createSessionRequest = catchAsync(async (req, res) => {
  const studentId = req.user._id;
  const {
    title,
    description,
    category,
    subCategory,
    tags,
    schedule,
    price,
    maxStudents,
    location,
  } = req.body;

  const newSessionRequest = await Session.create({
    creator: studentId,
    type: "Request",
    status: "Pending",
    title,
    description,
    category,
    subCategory,
    tags,
    schedule,
    price,
    maxStudents,
    location,
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Session request created successfully.",
    data: newSessionRequest,
  });
});

/**
 * @description STUDENT accepts a tutor's offer for their session request.
 */
export const acceptTutorOffer = catchAsync(async (req, res) => {
  const studentId = req.user._id;
  const { sessionId } = req.params;
  const { tutorId, paymentIntentId } = req.body;

  const session = await Session.findById(sessionId);

  if (!session || session.creator.toString() !== studentId.toString())
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Session not found or you are not the owner."
    );
  if (session.status !== "AwaitingTutorSelection")
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Session is not awaiting tutor selection."
    );

  const applicant = session.tutorApplicants.find(
    (app) => app.tutorId.toString() === tutorId
  );
  if (!applicant)
    throw new AppError(
      httpStatus.NOT_FOUND,
      "The selected tutor has not applied to this session."
    );

  if (applicant.offerPrice > 0 && !paymentIntentId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Payment pre-authorization ID is required to accept a paid offer."
    );
  }

  const updatedSession = await Session.findByIdAndUpdate(
    sessionId,
    {
      acceptedTutor: tutorId,
      status: "Booked",
      price: applicant.offerPrice,
      paymentIntentId: paymentIntentId || null,
      $push: { enrolledStudents: studentId },
    },
    { new: true }
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Tutor accepted. The session is now booked.",
    data: updatedSession,
  });
});

// ====================================================================
// --- TUTOR: SESSION OFFER WORKFLOW ---
// ====================================================================

/**
 * @description TUTOR creates an offer for a session they can teach.
 */
export const createSessionOffer = catchAsync(async (req, res) => {
  const tutorId = req.user._id;
  let {
    title,
    description,
    category,
    subCategory,
    tags,
    schedule,
    price,
    maxStudents,
    location,
    cancellationPolicy,
  } = req.body;

  try {
    if (schedule && typeof schedule === "string") {
      schedule = JSON.parse(schedule);
    } else if (typeof schedule !== "object") {
      throw new Error("Schedule data is missing or not a valid object/string.");
    }
  } catch (e) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Invalid JSON format for schedule data: ${e.message}`
    );
  }

  if (!req.file)
    throw new AppError(httpStatus.BAD_REQUEST, "A cover photo is required.");
  if (
    !title ||
    !category ||
    !schedule ||
    !schedule.date ||
    !schedule.startTime ||
    !schedule.duration ||
    price === undefined ||
    !location
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Missing required fields for session offer (including schedule details)."
    );
  }

  const coverPhotoResult = await uploadOnCloudinary(req.file.buffer);

  const newSessionOffer = await Session.create({
    creator: tutorId,
    type: "Offer",
    status: "Active",
    acceptedTutor: tutorId,
    title,
    description,
    category,
    subCategory,
    tags,
    schedule,
    price,
    maxStudents,
    location,
    cancellationPolicy,
    coverPhoto: {
      public_id: coverPhotoResult.public_id,
      url: coverPhotoResult.secure_url,
    },
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Session offer created.",
    data: newSessionOffer,
  });
});

/**
 * @description STUDENT books (enrolls in) a tutor's session offer.
 */
export const bookSessionOffer = catchAsync(async (req, res) => {
  const studentId = req.user._id;
  const { sessionId } = req.params;
  const { paymentIntentId } = req.body;

  const session = await Session.findById(sessionId);

  if (
    !session ||
    session.type !== "Offer" ||
    !["Active", "Booked"].includes(session.status)
  ) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "This session is not available for booking."
    );
  }
  if (session.enrolledStudents.length >= session.maxStudents) {
    throw new AppError(httpStatus.BAD_REQUEST, "This session is already full.");
  }
  if (
    session.enrolledStudents.some(
      (id) => id.toString() === studentId.toString()
    )
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You are already enrolled in this session."
    );
  }

  if (session.price > 0 && !paymentIntentId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Payment pre-authorization ID is required."
    );
  }

  const updatedSession = await Session.findByIdAndUpdate(
    sessionId,
    {
      paymentIntentId: paymentIntentId || null,
      status: "Booked",
      $push: { enrolledStudents: studentId },
    },
    { new: true }
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "You have successfully booked the session.",
    data: updatedSession,
  });
});

// ====================================================================
// --- TUTOR: APPLYING TO STUDENT REQUESTS ---
// ====================================================================

/**
 * @description TUTOR applies to a student's session request with an offer.
 */
export const applyToSessionRequest = catchAsync(async (req, res) => {
  const tutorId = req.user._id;
  const { sessionId } = req.params;
  const { offerPrice } = req.body;

  if (!offerPrice || offerPrice <= 0)
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "A valid offer price is required."
    );

  const session = await Session.findById(sessionId);

  if (
    !session ||
    session.type !== "Request" ||
    !["Pending", "AwaitingTutorSelection"].includes(session.status)
  )
    throw new AppError(
      httpStatus.NOT_FOUND,
      "This session request is not available for applications."
    );
  if (session.tutorApplicants.some((app) => app.tutorId.toString() === tutorId))
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You have already applied to this session."
    );

  session.tutorApplicants.push({ tutorId, offerPrice });
  session.status = "AwaitingTutorSelection";
  await session.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Your application has been submitted to the student.",
    data: session,
  });
});

/**
 * @description TUTOR withdraws their offer/application from a student's session request.
 * @route PATCH /api/v1/sessions/request/:sessionId/withdraw
 * @access Tutor
 */
export const withdrawOffer = catchAsync(async (req, res) => {
  const tutorId = req.user._id;
  const { sessionId } = req.params;

  const session = await Session.findById(sessionId);

  if (
    !session ||
    session.type !== "Request" ||
    !["Pending", "AwaitingTutorSelection"].includes(session.status)
  ) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Active session request not found or cannot be withdrawn from."
    );
  }

  const applicantIndex = session.tutorApplicants.findIndex(
    (app) => app.tutorId.toString() === tutorId.toString()
  );

  if (applicantIndex === -1) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You have not applied to this session request."
    );
  }

  session.tutorApplicants.splice(applicantIndex, 1);

  if (
    session.tutorApplicants.length === 0 &&
    session.status === "AwaitingTutorSelection"
  ) {
    session.status = "Pending";
  }

  await session.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Your offer has been successfully withdrawn.",
    data: session,
  });
});

// ====================================================================
// --- CANCELLATION & PAYMENT FLOW ---
// ====================================================================

/**
 * @description STUDENT pre-authorizes payment for a session before booking.
 */
export const preauthorizeSessionPayment = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const session = await Session.findById(sessionId).populate({
    path: "acceptedTutor",
    select: "+stripeAccountId",
  });

  if (!session) throw new AppError(httpStatus.NOT_FOUND, "Session not found.");
  if (session.price <= 0)
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This session is free and does not require payment."
    );

  let tutorStripeId;
  let finalPrice;

  if (session.type === "Offer") {
    if (!session.acceptedTutor?.stripeAccountId) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "The tutor is not configured to receive payments."
      );
    }
    tutorStripeId = session.acceptedTutor.stripeAccountId;
    finalPrice = session.price;
  } else if (session.type === "Request") {
    const { tutorId } = req.body;
    if (!tutorId) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Tutor ID is required to pre-authorize payment for a session request."
      );
    }
    const tutor = await User.findById(tutorId).select("+stripeAccountId");
    const applicant = session.tutorApplicants.find(
      (app) => app.tutorId.toString() === tutorId
    );

    if (!tutor || !tutor.stripeAccountId) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "The selected tutor is not configured to receive payments."
      );
    }
    if (!applicant) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        "This tutor has not applied to the session."
      );
    }
    tutorStripeId = tutor.stripeAccountId;
    finalPrice = applicant.offerPrice;
  } else {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid session type.");
  }

  const { clientSecret, paymentIntentId } = await createPaymentIntent(
    finalPrice,
    tutorStripeId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Payment intent created successfully.",
    data: { clientSecret, paymentIntentId, finalPrice },
  });
});

/**
 * @description User (Student or Tutor) cancels a booked session.
 */
export const cancelSession = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { sessionId } = req.params;
  const { reason } = req.body;

  const session = await Session.findById(sessionId);

  if (!session) throw new AppError(httpStatus.NOT_FOUND, "Session not found.");

  const isStudent = session.enrolledStudents.some(
    (id) => id.toString() === userId.toString()
  );
  const isTutor = session.acceptedTutor?.toString() === userId.toString();

  if (!isStudent && !isTutor)
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You are not a participant in this session."
    );
  if (session.status !== "Booked")
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot cancel a session with status: ${session.status}.`
    );

  session.status = "Cancelled";
  session.cancellationDetails = {
    cancelledBy: userId,
    reason: reason || "No reason provided",
    timestamp: new Date(),
  };

  if (session.paymentIntentId) {
    await releasePaymentIntent(session.paymentIntentId);
  }

  await session.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message:
      "Session has been cancelled and any pre-authorized payments have been released.",
    data: session,
  });
});

// ====================================================================
// --- QR CODE CHECK-IN & CHECK-OUT WORKFLOW ---
// ====================================================================

/**
 * @description STUDENT generates a QR code for a specific session to check-in.
 */
export const studentGenerateCheckInQR = catchAsync(async (req, res) => {
  const studentId = req.user._id;
  const { sessionId } = req.params;
  const session = await Session.findById(sessionId);

  if (
    !session ||
    !session.enrolledStudents.some(
      (id) => id.toString() === studentId.toString()
    )
  )
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Session not found or you are not enrolled."
    );
  if (session.status !== "Booked")
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Session must be in 'Booked' status to check in. Current status: ${session.status}.`
    );

  const tokenPayload = { sessionId, studentId, type: "checkIn" };
  const token = createToken(
    tokenPayload,
    CHECK_TOKEN_SECRET,
    CHECK_TOKEN_EXPIRE
  );

  let attendanceRecord = session.attendance.find(
    (a) => a.student.toString() === studentId.toString()
  );
  if (attendanceRecord) {
    if (attendanceRecord.checkIn.timestamp) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You have already checked in."
      );
    }
    attendanceRecord.checkIn.token = token;
  } else {
    session.attendance.push({ student: studentId, checkIn: { token } });
  }
  await session.save();

  const qrCodeImage = await QRCode.toDataURL(token);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Check-in QR Code generated.",
    data: { qrCodeImage, token_for_testing: token },
  });
});

/**
 * @description TUTOR scans a student's QR code to perform check-in.
 */
export const tutorScanCheckInQR = catchAsync(async (req, res) => {
  const tutorId = req.user._id;
  const { token } = req.body;

  const payload = verifyToken(token, CHECK_TOKEN_SECRET);
  const { sessionId, studentId, type } = payload;

  if (type !== "checkIn")
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Invalid token type for check-in."
    );

  const session = await Session.findById(sessionId);
  if (!session || session.acceptedTutor?.toString() !== tutorId.toString())
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Session not found or you are not the tutor."
    );
  if (session.status !== "Booked" && session.status !== "Ongoing")
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Session status must be 'Booked' or 'Ongoing'.`
    );

  let attendanceRecord = session.attendance.find(
    (a) => a.student.toString() === studentId.toString()
  );
  if (!attendanceRecord || attendanceRecord.checkIn.token !== token)
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid or outdated QR code.");

  if (attendanceRecord.checkIn.timestamp) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This student has already been checked in."
    );
  }

  attendanceRecord.checkIn.timestamp = new Date();
  attendanceRecord.checkIn.token = null;

  if (session.status === "Booked") {
    session.status = "Ongoing";
  }

  await session.save();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Student check-in successful.",
    data: session,
  });
});

/**
 * @description TUTOR generates a single QR code for all students to check-out.
 */
export const tutorGenerateCheckOutQR = catchAsync(async (req, res) => {
  const tutorId = req.user._id;
  const { sessionId } = req.params;
  const session = await Session.findById(sessionId).select("+checkOutToken");

  if (!session || session.acceptedTutor?.toString() !== tutorId.toString()) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Session not found or you are not the tutor."
    );
  }
  if (session.status !== "Ongoing") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Session must be 'Ongoing' to generate a check-out code.`
    );
  }

  const tokenPayload = { sessionId, type: "checkOut" };
  const token = createToken(
    tokenPayload,
    CHECK_TOKEN_SECRET,
    CHECK_TOKEN_EXPIRE
  );

  session.checkOutToken = token;
  await session.save();

  const qrCodeImage = await QRCode.toDataURL(token);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Check-out QR Code generated for all students.",
    data: { qrCodeImage, token_for_testing: token },
  });
});

/**
 * @description STUDENT scans the tutor's QR code to perform check-out and trigger payment.
 */
export const studentScanCheckOutQR = catchAsync(async (req, res) => {
  const studentId = req.user._id;
  const { token } = req.body;

  const payload = verifyToken(token, CHECK_TOKEN_SECRET);
  const { sessionId, type } = payload;

  if (type !== "checkOut")
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Invalid token type for check-out."
    );

  const session = await Session.findById(sessionId).select("+checkOutToken");
  if (
    !session ||
    !session.enrolledStudents.some(
      (id) => id.toString() === studentId.toString()
    )
  )
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Session not found or you are not enrolled."
    );
  if (session.status !== "Ongoing")
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Session must be 'Ongoing' to check out.`
    );
  if (session.checkOutToken !== token) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Invalid or expired check-out token. Please ask the tutor to generate a new one."
    );
  }

  let attendanceRecord = session.attendance.find(
    (a) => a.student.toString() === studentId.toString()
  );
  if (!attendanceRecord || !attendanceRecord.checkIn.timestamp)
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You must be checked-in to check-out."
    );
  if (attendanceRecord.checkOut.timestamp)
    throw new AppError(httpStatus.BAD_REQUEST, "You have already checked out.");

  attendanceRecord.checkOut.timestamp = new Date();

  const allCheckedInStudents = session.attendance.filter(
    (a) => a.checkIn.timestamp
  );
  const allCheckedOut = allCheckedInStudents.every((a) => a.checkOut.timestamp);

  if (allCheckedOut) {
    if (session.price > 0) {
      await _calculateAndAssignProfits(session);
      await _captureSessionPayment(session);
    }
    session.status = "Completed";
    session.checkOutToken = undefined;
  }

  await session.save();

  const message = allCheckedOut
    ? "Check-out successful. Session is now complete and payment is being processed."
    : "Check-out successful.";

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message,
    data: session,
  });
});

// ====================================================================
// --- NEW: EDIT, DELETE, DUPLICATE SESSIONS ---
// ====================================================================

/**
 * @description (NEW) Edit a session. (Student or Tutor)
 * @route PATCH /api/v1/sessions/:sessionId/edit
 * @access Authenticated (Creator of the session)
 */
export const updateSession = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user._id;
  let updates = req.body;

  const session = await Session.findById(sessionId);

  if (!session) {
    throw new AppError(httpStatus.NOT_FOUND, "Session not found.");
  }

  // 1. Authorization Check: Must be the creator
  if (session.creator.toString() !== userId.toString()) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You are not authorized to edit this session."
    );
  }

  // 2. Business Logic Check: Cannot edit if it's booked or completed
  if (
    ["Booked", "Ongoing", "Completed", "Cancelled"].includes(session.status) &&
    session.enrolledStudents.length > 0
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Cannot edit a session that has been booked or completed."
    );
  }

  // 3. Handle multipart/form-data for schedule (if sent as string)
  try {
    if (updates.schedule && typeof updates.schedule === "string") {
      updates.schedule = JSON.parse(updates.schedule);
    }
  } catch (e) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Invalid JSON format for schedule data."
    );
  }

  // 4. Handle optional file upload for cover photo
  if (req.file) {
    const coverPhotoResult = await uploadOnCloudinary(req.file.buffer);
    updates.coverPhoto = {
      public_id: coverPhotoResult.public_id,
      url: coverPhotoResult.secure_url,
    };
  }

  // 5. Apply updates and save
  Object.assign(session, updates);
  await session.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Session updated successfully.",
    data: session,
  });
});

/**
 * @description (NEW) Delete a session. (Student or Tutor)
 * @route DELETE /api/v1/sessions/:sessionId
 * @access Authenticated (Creator of the session)
 */
export const deleteSession = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user._id;

  const session = await Session.findById(sessionId);

  if (!session) {
    throw new AppError(httpStatus.NOT_FOUND, "Session not found.");
  }

  // 1. Authorization Check: Must be the creator
  if (session.creator.toString() !== userId.toString()) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You are not authorized to delete this session."
    );
  }

  // 2. Business Logic Check: Cannot delete if it has participants or is completed
  if (
    session.enrolledStudents.length > 0 ||
    ["Booked", "Ongoing", "Completed"].includes(session.status)
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Cannot delete a session that has or had participants. Please cancel it instead."
    );
  }

  // 3. Perform delete
  await Session.findByIdAndDelete(sessionId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Session deleted successfully.",
    data: null,
  });
});

/**
 * @description (NEW) Duplicate a session. (Tutor only)
 * @route POST /api/v1/sessions/:sessionId/duplicate
 * @access Tutor
 */
export const duplicateSession = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const tutorId = req.user._id;

  const originalSession = await Session.findById(sessionId).lean(); // .lean() for a plain JS object

  if (!originalSession) {
    throw new AppError(httpStatus.NOT_FOUND, "Original session not found.");
  }

  // 1. Authorization Check: Must be the creator and it must be an "Offer"
  if (
    originalSession.creator.toString() !== tutorId.toString() ||
    originalSession.type !== "Offer"
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You can only duplicate your own session offers."
    );
  }

  // 2. Prepare new session data
  // Destructure to remove fields that should not be copied
  const {
    _id,
    createdAt,
    updatedAt,
    status,
    enrolledStudents,
    attendance,
    tutorApplicants,
    paymentIntentId,
    checkOutToken,
    cancellationDetails,
    ...newSessionData
  } = originalSession;

  // 3. Set new properties for the duplicated session
  newSessionData.title = `${originalSession.title} (Copy)`;
  newSessionData.status = "Active"; // New sessions are active by default

  // Ensure schedule is not in the past (optional, but good practice)
  // For simplicity, we'll just copy it. The tutor can edit it.
  // newSessionData.schedule = ... // TBD if schedule needs modification

  const duplicatedSession = await Session.create(newSessionData);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Session duplicated successfully.",
    data: duplicatedSession,
  });
});

// ====================================================================
// --- GENERAL/PUBLIC SESSION CONTROLLERS ---
// ====================================================================

export const getAllSessions = catchAsync(async (req, res) => {
  const { type, searchTerm, category } = req.body;
  const query = {};
  if (type) {
    query.type = type;
    query.status =
      type === "Request"
        ? { $in: ["Pending", "AwaitingTutorSelection"] }
        : "Active";
  } else {
    query.$or = [
      { type: "Offer", status: "Active" },
      {
        type: "Request",
        status: { $in: ["Pending", "AwaitingTutorSelection"] },
      },
    ];
  }
  if (searchTerm) {
    query.title = { $regex: searchTerm, $options: "i" };
  }
  if (category) {
    query.category = category;
  }

  const sessions = await Session.find(query)
    .populate("creator", "name avatar")
    .populate("category", "name")
    .sort({ createdAt: -1 });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Sessions fetched successfully.",
    data: sessions,
  });
});

export const getSessionDetails = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const session = await Session.findById(sessionId).populate([
    { path: "creator", select: "name avatar tutorProfile" },
    { path: "acceptedTutor", select: "name avatar tutorProfile" },
    { path: "enrolledStudents", select: "name avatar" },
    { path: "location" },
    { path: "category", select: "name" },
    { path: "tutorApplicants.tutorId", select: "name avatar tutorProfile" },
  ]);
  if (!session) {
    throw new AppError(httpStatus.NOT_FOUND, "Session not found.");
  }
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Session details fetched successfully.",
    data: session,
  });
});

// --- UPDATED getMySessions with Tutor Logic & Refined Offers ---
/**
 * @description Get sessions associated with the logged-in user (Student OR Tutor), with filtering.
 * @route GET /api/v1/sessions/my-sessions
 * @access Authenticated
 */
export const getMySessions = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const userRole = req.user.role;
  const {
    tab,
    status: statusFilter,
    dateFrom,
    dateTo,
    page = 1,
    limit = 10,
  } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  let query = {};
  let sortOptions = { "schedule.date": -1 };
  let populateOptions = [
    { path: "creator", select: "name" },
    { path: "acceptedTutor", select: "name" },
    { path: "location", select: "name" },
  ];

  if (userRole === "Student") {
    if (tab === "Upcoming") {
      query.enrolledStudents = userId;
      query.status = { $in: ["Booked", "Ongoing"] };
      query["schedule.date"] = { $gte: new Date().setHours(0, 0, 0, 0) };
      sortOptions = { "schedule.date": 1 };
    } else if (tab === "Request") {
      query.creator = userId;
      query.type = "Request";
      query.status = { $in: ["Pending", "AwaitingTutorSelection"] };
      sortOptions = { createdAt: -1 };
      populateOptions.push({
        path: "tutorApplicants.tutorId",
        select: "name avatar tutorProfile",
      });
    } else if (tab === "History") {
      query.$or = [{ enrolledStudents: userId }, { creator: userId }];
      query.status = { $in: ["Completed", "Cancelled"] };
      sortOptions = { updatedAt: -1 };

      if (statusFilter) {
        const validHistoryStatus = ["Completed", "Cancelled"];
        if (validHistoryStatus.includes(statusFilter)) {
          query.status = statusFilter;
        } else {
          console.warn(
            `Invalid status filter "${statusFilter}" for History tab ignored.`
          );
        }
      }
      if (dateFrom || dateTo) {
        query["schedule.date"] = query["schedule.date"] || {};
        if (dateFrom) {
          const startDate = new Date(dateFrom);
          startDate.setHours(0, 0, 0, 0);
          query["schedule.date"].$gte = startDate;
        }
        if (dateTo) {
          const endDate = new Date(dateTo);
          endDate.setHours(23, 59, 59, 999);
          query["schedule.date"].$lte = endDate;
        }
      }
    } else {
      query.$or = [{ creator: userId }, { enrolledStudents: userId }];
    }
  } else if (userRole === "Tutor") {
    if (tab === "Upcoming") {
      query.acceptedTutor = userId;
      query.status = { $in: ["Booked", "Ongoing"] };
      query["schedule.date"] = { $gte: new Date().setHours(0, 0, 0, 0) };
      sortOptions = { "schedule.date": 1 };
    } else if (tab === "Offers") {
      query.type = "Request";
      query.status = { $in: ["Pending", "AwaitingTutorSelection"] };
      query["tutorApplicants.tutorId"] = userId;
      sortOptions = { createdAt: -1 };
      populateOptions = [
        { path: "creator", select: "name avatar" },
        { path: "location", select: "name" },
      ];
    } else if (tab === "History") {
      query.acceptedTutor = userId;
      query.status = { $in: ["Completed", "Cancelled"] };
      sortOptions = { updatedAt: -1 };

      if (statusFilter) {
        const validHistoryStatus = ["Completed", "Cancelled"];
        if (validHistoryStatus.includes(statusFilter)) {
          query.status = statusFilter;
        } else {
          console.warn(
            `Invalid status filter "${statusFilter}" for History tab ignored.`
          );
        }
      }
      if (dateFrom || dateTo) {
        query["schedule.date"] = query["schedule.date"] || {};
        if (dateFrom) {
          const startDate = new Date(dateFrom);
          startDate.setHours(0, 0, 0, 0);
          query["schedule.date"].$gte = startDate;
        }
        if (dateTo) {
          const endDate = new Date(dateTo);
          endDate.setHours(23, 59, 59, 999);
          query["schedule.date"].$lte = endDate;
        }
      }
    } else {
      query.$or = [
        { acceptedTutor: userId },
        { creator: userId, type: "Offer" },
      ];
    }
  } else {
    query.$or = [
      { creator: userId },
      { acceptedTutor: userId },
      { enrolledStudents: userId },
    ];
  }

  const totalSessions = await Session.countDocuments(query);

  const sessions = await Session.find(query)
    .populate(populateOptions)
    .sort(sortOptions)
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Your sessions have been fetched successfully.",
    data: {
      sessions,
      total: totalSessions,
      page: parseInt(page),
      totalPages: Math.ceil(totalSessions / limit),
    },
  });
});
// --- END UPDATED getMySessions ---

// ====================================================================
// --- CALENDAR VIEW CONTROLLER ---
// ====================================================================
/**
 * @description Get sessions for the logged-in user within a specific date range for calendar views.
 * @route GET /api/v1/sessions/my-calendar
 * @access Authenticated (Student, Tutor)
 */
export const getMyCalendarSessions = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { view, targetDate } = req.query;

  let startDate, endDate;
  const date = targetDate ? new Date(targetDate) : new Date();

  if (view === "day") {
    startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);
  } else if (view === "week") {
    const dayOfWeek = date.getDay();
    startDate = new Date(date);
    startDate.setDate(date.getDate() - dayOfWeek);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);
  } else if (view === "month") {
    startDate = new Date(date.getFullYear(), date.getMonth(), 1);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    endDate.setHours(23, 59, 59, 999);
  } else {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Invalid view parameter. Must be 'day', 'week', or 'month'."
    );
  }

  const query = {
    $or: [
      { enrolledStudents: userId },
      { creator: userId },
      { acceptedTutor: userId },
    ],
    status: { $nin: ["Cancelled"] },
    "schedule.date": { $gte: startDate, $lte: endDate },
  };

  const sessions = await Session.find(query)
    .select(
      "title schedule.date schedule.startTime schedule.duration status type"
    )
    .sort({ "schedule.date": 1, "schedule.startTime": 1 })
    .lean();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Calendar sessions fetched successfully for ${view} view.`,
    data: { sessions, startDate, endDate },
  });
});

// ====================================================================
// --- ADMIN DEBUGGING CONTROLLER ---
// ====================================================================
export const adminManualCapture = catchAsync(async (req, res) => {
  const { sessionId } = req.params;

  const session = await Session.findById(sessionId);
  if (!session) {
    throw new AppError(httpStatus.NOT_FOUND, "Session not found.");
  }
  if (session.status !== "Booked") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Session must be in 'Booked' status to be manually completed. Current status: ${session.status}`
    );
  }

  if (session.enrolledStudents.length > 0 && session.attendance.length === 0) {
    session.enrolledStudents.forEach((studentId) => {
      session.attendance.push({
        student: studentId,
        checkIn: { timestamp: new Date() },
        checkOut: { timestamp: new Date() },
      });
    });
  }

  await _calculateAndAssignProfits(session);

  if (session.price > 0) {
    await _captureSessionPayment(session);
  }

  session.status = "Completed";
  await session.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message:
      "Session manually completed, payment captured, and wallets updated.",
    data: session,
  });
});
