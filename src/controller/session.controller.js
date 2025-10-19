import httpStatus from "http-status";
import mongoose from "mongoose";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { Session } from "../model/session.model.js";
import { User } from "../model/user.model.js";
import { Location } from "../model/location.model.js";
import { Transaction } from "../model/transaction.model.js";
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

    // Use the length of enrolledStudents for the amount calculation
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

  // Use findByIdAndUpdate for a more reliable save
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

  // --- THIS IS THE FIX ---
  // Use findByIdAndUpdate with $push for a guaranteed atomic update.
  const updatedSession = await Session.findByIdAndUpdate(
    sessionId,
    {
      paymentIntentId: paymentIntentId || null,
      status: "Booked",
      $push: { enrolledStudents: studentId },
    },
    { new: true }
  ); // {new: true} returns the updated document

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
// --- GENERAL/PUBLIC SESSION CONTROLLERS ---
// ====================================================================

export const getAllSessions = catchAsync(async (req, res) => {
  const { type, searchTerm, category } = req.query;
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

export const getMySessions = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const sessions = await Session.find({
    $or: [
      { creator: userId },
      { acceptedTutor: userId },
      { enrolledStudents: userId },
    ],
  })
    .populate("creator", "name")
    .populate("acceptedTutor", "name")
    .sort({ "schedule.date": -1 });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Your sessions have been fetched successfully.",
    data: sessions,
  });
});

// ====================================================================
// --- NEW: ADMIN DEBUGGING CONTROLLER ---
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

  // Manually add the student to attendance for calculation purposes
  if (session.enrolledStudents.length > 0 && session.attendance.length === 0) {
    session.enrolledStudents.forEach((studentId) => {
      session.attendance.push({
        student: studentId,
        checkIn: { timestamp: new Date() },
        checkOut: { timestamp: new Date() },
      });
    });
  }

  // Trigger the payment capture and wallet update
  if (session.price > 0) {
    await _captureSessionPayment(session);
  }

  // Complete the session
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
