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

const _calculateAndAssignProfits = async (session) => {
  try {
    const settings = await Settings.getSettings();
    const totalRevenue = session.enrollments.reduce(
      (acc, enrollment) => acc + enrollment.totalAmount,
      0
    );

    if (totalRevenue > 0) {
      const platformRate = settings.profitDistribution.platform / 100;
      const tutorRate = settings.profitDistribution.tutor / 100;
      const locationOwnerRate = settings.profitDistribution.locationOwner / 100;

      session.adminCommission = parseFloat(
        (totalRevenue * platformRate).toFixed(2)
      );
      session.tutorEarnings = parseFloat((totalRevenue * tutorRate).toFixed(2));
      session.locationOwnerEarnings = parseFloat(
        (totalRevenue * locationOwnerRate).toFixed(2)
      );
    } else {
      session.adminCommission = 0;
      session.tutorEarnings = 0;
      session.locationOwnerEarnings = 0;
    }
  } catch (error) {
    console.error("Error calculating profit distribution:", error);
    session.adminCommission = 0;
    session.tutorEarnings = 0;
    session.locationOwnerEarnings = 0;
  }
};

const _captureSessionPayment = async (session) => {
  for (const enrollment of session.enrollments) {
    if (enrollment.paymentIntentId) {
      try {
        await capturePaymentIntent(enrollment.paymentIntentId);
        await Transaction.create({
          user: enrollment.parent,
          type: "Payment",
          amount: enrollment.totalAmount,
          status: "Completed",
          paymentGatewayId: enrollment.paymentIntentId,
          description: `Payment captured for session: ${session.title}`,
          relatedSession: session._id,
        });
      } catch (error) {
        console.error(
          `Failed to capture PaymentIntent ${enrollment.paymentIntentId}:`,
          error.message
        );
      }
    }
  }

  try {
    if (session.acceptedTutor && session.tutorEarnings > 0) {
      await User.findByIdAndUpdate(session.acceptedTutor, {
        $inc: { "wallet.balance": session.tutorEarnings },
      });
      console.log(
        `Instructed DB to increment tutor wallet by ${session.tutorEarnings}`
      );
    }

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

  let parsedTags = tags;
  let parsedSchedule = schedule;

  try {
    if (tags && typeof tags === "string") {
      parsedTags = JSON.parse(tags);
    }
    if (schedule && typeof schedule === "string") {
      parsedSchedule = JSON.parse(schedule);
    }
  } catch (e) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Invalid JSON format for schedule or tags."
    );
  }

  const newSessionRequest = await Session.create({
    creator: studentId,
    type: "Request",
    status: "Pending",
    title,
    description,
    category,
    subCategory,
    tags: parsedTags,
    schedule: parsedSchedule,
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

export const acceptTutorOffer = catchAsync(async (req, res) => {
  const studentId = req.user._id;
  const { sessionId } = req.params;
  const { tutorId, paymentIntentId, minorIds } = req.body;

  if (!minorIds || !Array.isArray(minorIds) || minorIds.length === 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "An array of minor IDs is required."
    );
  }

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

  const enrolledMinorsCount = session.enrollments.reduce(
    (acc, enrollment) => acc + enrollment.minors.length,
    0
  );
  const newMinorsCount = minorIds.length;
  if (enrolledMinorsCount + newMinorsCount > session.maxStudents) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `This session is full. Only ${
        session.maxStudents - enrolledMinorsCount
      } spots remaining.`
    );
  }

  const pricePerMinor = applicant.offerPrice;
  const totalAmount = pricePerMinor * newMinorsCount;

  if (pricePerMinor > 0 && !paymentIntentId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Payment pre-authorization ID is required to accept a paid offer."
    );
  }

  const newEnrollment = {
    parent: studentId,
    minors: minorIds,
    paymentIntentId: paymentIntentId || null,
    pricePerMinor: pricePerMinor,
    totalAmount: totalAmount,
  };

  session.acceptedTutor = tutorId;
  session.status = "Booked";
  session.price = pricePerMinor;
  session.enrollments.push(newEnrollment);

  await session.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Tutor accepted. The session is now booked.",
    data: session,
  });
});

// ====================================================================
// --- TUTOR: SESSION OFFER WORKFLOW ---
// ====================================================================

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
    tutorNote,
  } = req.body;

  let parsedSchedule = schedule;
  let parsedTags = tags;

  try {
    if (schedule && typeof schedule === "string") {
      parsedSchedule = JSON.parse(schedule);
    }
    if (tags && typeof tags === "string") {
      parsedTags = JSON.parse(tags);
    } else if (typeof tags === "undefined") {
      parsedTags = [];
    }
  } catch (e) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Invalid JSON format for schedule or tags: ${e.message}`
    );
  }

  const coverPhotoFile =
    req.files && req.files.find((file) => file.fieldname === "coverPhoto");

  if (!coverPhotoFile)
    throw new AppError(httpStatus.BAD_REQUEST, "A cover photo is required.");

  if (
    !title ||
    !category ||
    !parsedSchedule ||
    !parsedSchedule.date ||
    !parsedSchedule.startTime ||
    !schedule.duration ||
    price === undefined ||
    !location ||
    !maxStudents
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Missing required fields. Please check title, category, schedule, price, max students, and location."
    );
  }

  const coverPhotoResult = await uploadOnCloudinary(coverPhotoFile.buffer);

  const newSessionOffer = await Session.create({
    creator: tutorId,
    type: "Offer",
    status: "Active",
    acceptedTutor: tutorId,
    title,
    description,
    category,
    subCategory,
    tags: parsedTags,
    schedule: parsedSchedule,
    price,
    maxStudents,
    location,
    cancellationPolicy,
    tutorNote,
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

export const bookSessionOffer = catchAsync(async (req, res) => {
  const studentId = req.user._id;
  const { sessionId } = req.params;
  const { paymentIntentId, minorIds } = req.body;

  if (!minorIds || !Array.isArray(minorIds) || minorIds.length === 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "An array of minor IDs is required."
    );
  }

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

  const enrolledMinorsCount = session.enrollments.reduce(
    (acc, enrollment) => acc + enrollment.minors.length,
    0
  );
  const newMinorsCount = minorIds.length;
  if (enrolledMinorsCount + newMinorsCount > session.maxStudents) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `This session is full. Only ${
        session.maxStudents - enrolledMinorsCount
      } spots remaining.`
    );
  }

  const parentEnrollments = session.enrollments.filter(
    (e) => e.parent.toString() === studentId.toString()
  );
  const alreadyEnrolledMinors = parentEnrollments.flatMap((e) =>
    e.minors.map((m) => m.toString())
  );
  const isDuplicateEnrollment = minorIds.some((m) =>
    alreadyEnrolledMinors.includes(m)
  );
  if (isDuplicateEnrollment) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "One or more of these minors are already enrolled in this session."
    );
  }

  const pricePerMinor = session.price;
  const totalAmount = pricePerMinor * newMinorsCount;

  if (pricePerMinor > 0 && !paymentIntentId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Payment pre-authorization ID is required."
    );
  }

  const newEnrollment = {
    parent: studentId,
    minors: minorIds,
    paymentIntentId: paymentIntentId || null,
    pricePerMinor: pricePerMinor,
    totalAmount: totalAmount,
  };

  session.status = "Booked";
  session.enrollments.push(newEnrollment);

  await session.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "You have successfully booked the session.",
    data: session,
  });
});

// ====================================================================
// --- TUTOR: APPLYING TO STUDENT REQUESTS ---
// ====================================================================

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

export const preauthorizeSessionPayment = catchAsync(async (req, res) => {
  throw new AppError(
    httpStatus.BAD_REQUEST,
    "This endpoint is deprecated. Please use /api/v1/financials/sessions/:sessionId/create-payment-intent"
  );
});

// --- THIS FUNCTION IS NOW FIXED ---
export const cancelSession = catchAsync(async (req, res) => {
  const userId = req.user._id.toString(); // User cancelling
  const { sessionId } = req.params;
  const { reason } = req.body;

  const session = await Session.findById(sessionId);
  if (!session) throw new AppError(httpStatus.NOT_FOUND, "Session not found.");

  const isTutor = session.acceptedTutor?.toString() === userId;
  const parentEnrollment = session.enrollments.find(
    (e) => e.parent.toString() === userId
  );

  if (!isTutor && !parentEnrollment)
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You are not a participant in this session."
    );
  if (session.status !== "Booked")
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot cancel a session with status: ${session.status}.`
    );

  let message;

  if (isTutor) {
    // --- TUTOR CANCELLATION ---
    message =
      "Session cancelled by tutor. All parent payments are being refunded.";
    // Refund *everyone*
    for (const enrollment of session.enrollments) {
      if (enrollment.paymentIntentId) {
        try {
          await releasePaymentIntent(enrollment.paymentIntentId);
          // (Optional: send notification to parent)
        } catch (error) {
          console.error(
            `Failed to release payment ${enrollment.paymentIntentId} for parent ${enrollment.parent}`,
            error
          );
        }
      }
    }
  } else {
    // --- PARENT CANCELLATION ---
    // A parent is cancelling. This cancels the session for *everyone*.
    message =
      "Session cancelled by a parent. You have been charged a 15% fee. All other participants have been refunded.";

    for (const enrollment of session.enrollments) {
      if (!enrollment.paymentIntentId) continue; // Skip free enrollments

      if (enrollment.parent.toString() === userId) {
        // This is the parent who is cancelling. Charge them the 15% fee.
        const cancellationFee = parseFloat(
          (enrollment.totalAmount * 0.15).toFixed(2)
        );
        try {
          await capturePaymentIntent(
            enrollment.paymentIntentId,
            cancellationFee,
            cancellationFee // 100% of the fee goes to the platform
          );
          await Transaction.create({
            user: userId,
            type: "Payment",
            amount: cancellationFee,
            status: "Completed",
            paymentGatewayId: enrollment.paymentIntentId,
            description: `Cancellation fee for session: ${session.title}`,
            relatedSession: session._id,
          });
        } catch (error) {
          console.error(
            `Failed to capture cancellation fee ${enrollment.paymentIntentId}:`,
            error
          );
          // If capture fails, release the whole thing to be safe
          await releasePaymentIntent(enrollment.paymentIntentId);
          message =
            "Session cancelled. We failed to process your cancellation fee, so your full payment hold has been released.";
        }
      } else {
        // This is a different parent. Refund them fully.
        try {
          await releasePaymentIntent(enrollment.paymentIntentId);
          // (Optional: send notification to this parent)
        } catch (error) {
          console.error(
            `Failed to release payment ${enrollment.paymentIntentId} for parent ${enrollment.parent}`,
            error
          );
        }
      }
    }
  }

  // Set session status to Cancelled
  session.status = "Cancelled";
  session.cancellationDetails = {
    cancelledBy: req.user._id, // The user object ID
    reason: reason || "No reason provided",
    timestamp: new Date(),
  };

  await session.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: message, // Send the dynamic message
    data: session,
  });
});

// ====================================================================
// --- QR CODE CHECK-IN & CHECK-OUT WORKFLOW (NEW FLOW) ---
// ====================================================================

export const studentGenerateCheckInQR = catchAsync(async (req, res) => {
  const studentId = req.user._id;
  const { sessionId } = req.params;
  const { minorId } = req.body;

  if (!minorId) {
    throw new AppError(httpStatus.BAD_REQUEST, "A minorId is required.");
  }

  const session = await Session.findById(sessionId);

  const enrollment = session.enrollments.find(
    (e) =>
      e.parent.toString() === studentId.toString() &&
      e.minors.some((m) => m.toString() === minorId)
  );

  if (!enrollment)
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Session not found or this minor is not enrolled."
    );
  if (session.status !== "Booked")
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Session must be in 'Booked' status to check in. Current status: ${session.status}.`
    );

  const tokenPayload = {
    sessionId,
    enrollmentId: enrollment._id,
    minorId,
    type: "checkIn",
  };
  const token = createToken(
    tokenPayload,
    CHECK_TOKEN_SECRET,
    CHECK_TOKEN_EXPIRE
  );

  let attendanceRecord = session.attendance.find(
    (a) =>
      a.enrollmentId.toString() === enrollment._id.toString() &&
      a.minorId.toString() === minorId
  );

  if (attendanceRecord) {
    if (attendanceRecord.checkIn.timestamp) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This minor has already checked in."
      );
    }
    attendanceRecord.checkIn.token = token;
  } else {
    session.attendance.push({
      enrollmentId: enrollment._id,
      minorId: minorId,
      checkIn: { token },
    });
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

export const studentGenerateCheckOutQR = catchAsync(async (req, res) => {
  const studentId = req.user._id;
  const { sessionId } = req.params;
  const { minorId } = req.body;

  if (!minorId) {
    throw new AppError(httpStatus.BAD_REQUEST, "A minorId is required.");
  }

  const session = await Session.findById(sessionId);

  const enrollment = session.enrollments.find(
    (e) =>
      e.parent.toString() === studentId.toString() &&
      e.minors.some((m) => m.toString() === minorId)
  );

  if (!enrollment)
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Session not found or this minor is not enrolled."
    );
  if (session.status !== "Ongoing")
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Session must be 'Ongoing' to check out. Current status: ${session.status}.`
    );

  let attendanceRecord = session.attendance.find(
    (a) =>
      a.enrollmentId.toString() === enrollment._id.toString() &&
      a.minorId.toString() === minorId
  );

  if (!attendanceRecord || !attendanceRecord.checkIn.timestamp) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This minor must be checked-in to check-out."
    );
  }
  if (attendanceRecord.checkOut.timestamp) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This minor has already checked out."
    );
  }

  const tokenPayload = {
    sessionId,
    enrollmentId: enrollment._id,
    minorId,
    type: "checkOut",
  };
  const token = createToken(
    tokenPayload,
    CHECK_TOKEN_SECRET,
    CHECK_TOKEN_EXPIRE
  );

  attendanceRecord.checkOut.token = token;

  await session.save();

  const qrCodeImage = await QRCode.toDataURL(token);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Check-out QR Code generated.",
    data: { qrCodeImage, token_for_testing: token },
  });
});

export const tutorScanQR = catchAsync(async (req, res) => {
  const tutorId = req.user._id;
  const { token } = req.body;

  let payload;
  try {
    payload = verifyToken(token, CHECK_TOKEN_SECRET);
  } catch (error) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid or expired QR code.");
  }

  const { sessionId, enrollmentId, minorId, type } = payload;

  const session = await Session.findById(sessionId);
  if (!session || session.acceptedTutor?.toString() !== tutorId.toString())
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Session not found or you are not the tutor for this session."
    );

  let attendanceRecord = session.attendance.find(
    (a) =>
      a.enrollmentId.toString() === enrollmentId &&
      a.minorId.toString() === minorId
  );

  if (type === "checkIn") {
    if (session.status !== "Booked" && session.status !== "Ongoing")
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Session status must be 'Booked' or 'Ongoing' to check in.`
      );
    if (!attendanceRecord || attendanceRecord.checkIn.token !== token)
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Invalid or outdated check-in QR code."
      );
    if (attendanceRecord.checkIn.timestamp) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This minor has already been checked in."
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
  } else if (type === "checkOut") {
    if (session.status !== "Ongoing")
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Session must be 'Ongoing' to check out.`
      );
    if (!attendanceRecord || !attendanceRecord.checkIn.timestamp)
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Minor must be checked-in before they can check-out."
      );
    if (attendanceRecord.checkOut.token !== token)
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Invalid or outdated check-out QR code."
      );
    if (attendanceRecord.checkOut.timestamp)
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This minor has already checked out."
      );

    attendanceRecord.checkOut.timestamp = new Date();
    attendanceRecord.checkOut.token = null;

    const totalEnrolledMinors = session.enrollments.reduce(
      (acc, e) => acc + e.minors.length,
      0
    );
    const allCheckedOutRecords = session.attendance.filter(
      (a) => a.checkOut.timestamp
    );

    let message = "Minor check-out successful.";

    if (allCheckedOutRecords.length === totalEnrolledMinors) {
      await _calculateAndAssignProfits(session);
      await _captureSessionPayment(session);

      session.status = "Completed";
      message =
        "Final minor checked out. Session is now complete and all payments are processing.";
    }

    await session.save();

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message,
      data: session,
    });
  } else {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid QR token type.");
  }
});

// ====================================================================
// --- GENERAL/PUBLIC SESSION CONTROLLERS ---
// ====================================================================

export const getAllSessions = catchAsync(async (req, res) => {
  const { searchTerm, category, subCategory, page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const query = {
    type: "Offer",
    status: "Active",
  };

  if (searchTerm) {
    query.title = { $regex: searchTerm, $options: "i" };
  }
  if (category) {
    query.category = category;
  }
  if (subCategory) {
    query.subCategory = subCategory;
  }

  const totalSessions = await Session.countDocuments(query);
  const sessions = await Session.find(query)
    .populate("creator", "name avatar")
    .populate("category", "name")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Sessions fetched successfully.",
    data: {
      sessions,
      total: totalSessions,
      page: parseInt(page),
      totalPages: Math.ceil(totalSessions / limit),
    },
  });
});

export const getSessionsByTutor = catchAsync(async (req, res) => {
  const { tutorId } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const query = {
    creator: tutorId,
    type: "Offer",
    status: "Active",
  };

  const totalSessions = await Session.countDocuments(query);
  const sessions = await Session.find(query)
    .populate("location", "name address.city address.state")
    .populate("category", "name")
    .select("title coverPhoto schedule price maxStudents location category")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Tutor's active sessions fetched successfully.",
    data: {
      sessions,
      total: totalSessions,
      page: parseInt(page),
      totalPages: Math.ceil(totalSessions / limit),
    },
  });
});

export const getSessionDetails = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const session = await Session.findById(sessionId).populate([
    { path: "creator", select: "name avatar tutorProfile" },
    { path: "acceptedTutor", select: "name avatar tutorProfile" },
    {
      path: "enrollments.parent",
      select: "name avatar",
    },
    {
      path: "tutorApplicants.tutorId",
      select: "name avatar tutorProfile",
    },
    { path: "location" },
    { path: "category", select: "name" },
  ]);

  if (!session) {
    throw new AppError(httpStatus.NOT_FOUND, "Session not found.");
  }

  const populatedEnrollments = await Promise.all(
    session.enrollments.map(async (enrollment) => {
      const parentUser = await User.findById(enrollment.parent)
        .select("minors")
        .lean();
      if (!parentUser) return enrollment;

      const populatedMinors = enrollment.minors
        .map((minorId) => {
          return parentUser.minors.find(
            (m) => m._id.toString() === minorId.toString()
          );
        })
        .filter(Boolean);

      return {
        _id: enrollment._id,
        parent: enrollment.parent,
        paymentIntentId: enrollment.paymentIntentId,
        pricePerMinor: enrollment.pricePerMinor,
        totalAmount: enrollment.totalAmount,
        minors: populatedMinors,
      };
    })
  );

  const responseSession = session.toObject();
  responseSession.enrollments = populatedEnrollments;

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Session details fetched successfully.",
    data: responseSession,
  });
});

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
      query["enrollments.parent"] = userId;
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
      query.$or = [{ "enrollments.parent": userId }, { creator: userId }];
      query.status = { $in: ["Completed", "Cancelled"] };
      sortOptions = { updatedAt: -1 };

      if (statusFilter) {
        const validHistoryStatus = ["Completed", "Cancelled"];
        if (validHistoryStatus.includes(statusFilter)) {
          query.status = statusFilter;
        }
      }
      if (dateFrom || dateTo) {
        query["schedule.date"] = query["schedule.date"] || {};
        if (dateFrom) query["schedule.date"].$gte = new Date(dateFrom);
        if (dateTo) query["schedule.date"].$lte = new Date(dateTo);
      }
    } else {
      query.$or = [{ creator: userId }, { "enrollments.parent": userId }];
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
        }
      }
      if (dateFrom || dateTo) {
        query["schedule.date"] = query["schedule.date"] || {};
        if (dateFrom) query["schedule.date"].$gte = new Date(dateFrom);
        if (dateTo) query["schedule.date"].$lte = new Date(dateTo);
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
      { "enrollments.parent": userId },
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

// ====================================================================
// --- CALENDAR VIEW CONTROLLER ---
// ====================================================================
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
      { "enrollments.parent": userId },
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

  if (session.enrollments.length > 0 && session.attendance.length === 0) {
    for (const enrollment of session.enrollments) {
      for (const minorId of enrollment.minors) {
        session.attendance.push({
          enrollmentId: enrollment._id,
          minorId: minorId,
          checkIn: { timestamp: new Date() },
          checkOut: { timestamp: new Date() },
        });
      }
    }
  }

  await _calculateAndAssignProfits(session);
  await _captureSessionPayment(session);

  session.status = "Completed";
  await session.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message:
      "Session manually completed, all payments captured, and wallets updated.",
    data: session,
  });
});

// ====================================================================
// --- EDIT, DELETE, DUPLICATE SESSIONS ---
// ====================================================================

export const updateSession = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user._id;
  let updates = req.body;

  const session = await Session.findById(sessionId);

  if (!session) {
    throw new AppError(httpStatus.NOT_FOUND, "Session not found.");
  }

  if (session.creator.toString() !== userId.toString()) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You are not authorized to edit this session."
    );
  }

  if (
    ["Booked", "Ongoing", "Completed", "Cancelled"].includes(session.status) &&
    session.enrollments.length > 0
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Cannot edit a session that has been booked or completed."
    );
  }

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

  const coverPhotoFile =
    req.files && req.files.find((file) => file.fieldname === "coverPhoto");
  if (coverPhotoFile) {
    const coverPhotoResult = await uploadOnCloudinary(coverPhotoFile.buffer);
    updates.coverPhoto = {
      public_id: coverPhotoResult.public_id,
      url: coverPhotoResult.secure_url,
    };
  }

  Object.assign(session, updates);
  await session.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Session updated successfully.",
    data: session,
  });
});

export const deleteSession = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user._id;

  const session = await Session.findById(sessionId);

  if (!session) {
    throw new AppError(httpStatus.NOT_FOUND, "Session not found.");
  }

  if (session.creator.toString() !== userId.toString()) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You are not authorized to delete this session."
    );
  }

  if (
    session.enrollments.length > 0 ||
    ["Booked", "Ongoing", "Completed"].includes(session.status)
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Cannot delete a session that has or had participants. Please cancel it instead."
    );
  }

  await Session.findByIdAndDelete(sessionId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Session deleted successfully.",
    data: null,
  });
});

export const duplicateSession = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const tutorId = req.user._id;

  const originalSession = await Session.findById(sessionId).lean();

  if (!originalSession) {
    throw new AppError(httpStatus.NOT_FOUND, "Original session not found.");
  }

  if (
    originalSession.creator.toString() !== tutorId.toString() ||
    originalSession.type !== "Offer"
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You can only duplicate your own session offers."
    );
  }

  const {
    _id,
    createdAt,
    updatedAt,
    status,
    enrollments,
    attendance,
    tutorApplicants,
    checkOutToken,
    cancellationDetails,
    ...newSessionData
  } = originalSession;

  newSessionData.title = `${originalSession.title} (Copy)`;
  newSessionData.status = "Active";

  const duplicatedSession = await Session.create(newSessionData);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Session duplicated successfully.",
    data: duplicatedSession,
  });
});
