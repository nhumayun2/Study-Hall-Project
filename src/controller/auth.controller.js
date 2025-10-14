import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
// The following line had an incorrect path. It is now corrected from 'models' to 'model'.
import { User } from "../model/user.model.js";
import { createToken, verifyToken } from "../utils/authToken.js";
import catchAsync from "../utils/catchAsync.js";
import { generateOTP } from "../utils/commonMethod.js";
import { sendEmail } from "../utils/sendEmail.js";
import sendResponse from "../utils/sendResponse.js";

/**
 * @description Handles new user registration for all roles.
 * Creates a user, embeds minor information if provided, and sends a verification OTP.
 */
export const register = catchAsync(async (req, res) => {
  const {
    name,
    username,
    email,
    password,
    confirmPassword,
    gender,
    dob,
    role, // Student, Tutor, LocationOwner
    minors, // Array of minor objects [{ name, gender, dob }]
  } = req.body;

  // --- 1. VALIDATION ---
  if (!name || !email || !password || !username || !gender || !dob || !role) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Please fill in all required fields: name, username, email, password, gender, dob, and role."
    );
  }

  if (password !== confirmPassword) {
    throw new AppError(httpStatus.FORBIDDEN, "Passwords do not match.");
  }

  const existingUser = await User.findOne({ $or: [{ email }, { username }] });
  if (existingUser) {
    throw new AppError(
      httpStatus.CONFLICT,
      "A user with this email or username already exists."
    );
  }

  // --- 2. PREPARE USER DATA ---
  const userData = {
    name,
    username,
    email,
    password,
    gender,
    dob,
    role,
    minors: Array.isArray(minors) ? minors : [],
  };

  // --- 3. GENERATE OTP AND TOKEN ---
  const otp = generateOTP();
  const otpPayload = { otp, email };
  const otpToken = createToken(
    otpPayload,
    process.env.OTP_SECRET,
    process.env.OTP_EXPIRE
  );

  userData.verificationInfo = { token: otpToken, verified: false };

  // --- 4. CREATE USER ---
  const newUser = await User.create(userData);

  // --- 5. SEND VERIFICATION EMAIL ---
  await sendEmail(
    newUser.email,
    "Verify Your Email Address",
    `Your 4-digit verification code is: <strong>${otp}</strong>`
  );

  // --- 6. SEND RESPONSE ---
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message:
      "Registration successful! A verification code has been sent to your email.",
    data: {
      userId: newUser._id,
      email: newUser.email,
    },
  });
});

/**
 * @description Handles user login for all roles.
 */
export const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Email and password are required."
    );
  }

  const user = await User.findOne({ email }).select("+password");

  if (!user || !(await user.isPasswordMatched(password, user.password))) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid email or password.");
  }

  if (user.status !== "Active") {
    throw new AppError(
      httpStatus.FORBIDDEN,
      `Your account is currently ${user.status}. Please contact support.`
    );
  }

  if (!user.verificationInfo.verified) {
    const otp = generateOTP();
    const otpToken = createToken(
      { otp, email: user.email },
      process.env.OTP_SECRET,
      process.env.OTP_EXPIRE
    );

    user.verificationInfo.token = otpToken;
    await user.save({ validateBeforeSave: false });

    await sendEmail(
      user.email,
      "Verify Your Email",
      `Your new verification code is: <strong>${otp}</strong>`
    );

    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message:
        "Your account is not verified. A new verification code has been sent to your email.",
      data: {
        userId: user._id,
        email: user.email,
      },
    });
  }

  const tokenPayload = { _id: user._id, email: user.email, role: user.role };

  const accessToken = createToken(
    tokenPayload,
    process.env.JWT_ACCESS_SECRET,
    process.env.JWT_ACCESS_EXPIRES_IN
  );
  const refreshToken = createToken(
    tokenPayload,
    process.env.JWT_REFRESH_SECRET,
    process.env.JWT_REFRESH_EXPIRES_IN
  );

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });

  const userResponse = user.toObject();
  delete userResponse.password;
  delete userResponse.refreshToken;

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Login successful.",
    data: { user: userResponse, accessToken },
  });
});

/**
 * @description Verifies the OTP sent to a user's email.
 */
export const verifyEmail = catchAsync(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "Email and OTP are required.");
  }

  const user = await User.findOne({ email });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found.");
  }
  if (user.verificationInfo.verified) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This account is already verified."
    );
  }
  if (!user.verificationInfo.token) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "No pending verification. Please try logging in again to get a new code."
    );
  }

  const decoded = verifyToken(
    user.verificationInfo.token,
    process.env.OTP_SECRET
  );
  if (String(decoded.otp) !== String(otp)) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      "The provided OTP is incorrect or has expired."
    );
  }

  user.verificationInfo.verified = true;
  user.verificationInfo.token = undefined;
  await user.save({ validateBeforeSave: false });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Email verified successfully. You can now log in.",
    data: null,
  });
});

/**
 * @description Sends a password reset OTP to the user's email.
 */
export const forgetPassword = catchAsync(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "No user found with this email address."
    );
  }

  const otp = generateOTP();
  const otpToken = createToken(
    { otp, email },
    process.env.OTP_SECRET,
    process.env.OTP_EXPIRE
  );

  user.passwordResetToken = otpToken;
  await user.save({ validateBeforeSave: false });

  await sendEmail(
    user.email,
    "Password Reset Code",
    `Your password reset code is: <strong>${otp}</strong>`
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "A password reset code has been sent to your email.",
    data: { email },
  });
});

/**
 * @description Resets the user's password using a valid OTP.
 */
export const resetPassword = catchAsync(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  const user = await User.findOne({ email }).select("+passwordResetToken");

  if (!user || !user.passwordResetToken) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Invalid or expired password reset request."
    );
  }

  const decoded = verifyToken(user.passwordResetToken, process.env.OTP_SECRET);
  if (String(decoded.otp) !== String(otp)) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      "The provided code is incorrect or has expired."
    );
  }

  user.password = newPassword;
  user.passwordResetToken = undefined;
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password has been reset successfully.",
    data: null,
  });
});

/**
 * @description Allows a logged-in user to change their password.
 */
export const changePassword = catchAsync(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const userId = req.user._id;

  const user = await User.findById(userId).select("+password");

  if (!user || !(await user.isPasswordMatched(oldPassword, user.password))) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      "The old password is not correct."
    );
  }

  user.password = newPassword;
  await user.save(); // Pre-save hook will hash the new password

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password changed successfully.",
    data: null,
  });
});

/**
 * @description Generates a new access token using a valid refresh token.
 */
export const refreshToken = catchAsync(async (req, res) => {
  const { refreshToken } = req.cookies;

  if (!refreshToken) {
    throw new AppError(httpStatus.UNAUTHORIZED, "You are not authorized.");
  }

  const decoded = verifyToken(refreshToken, process.env.JWT_REFRESH_SECRET);

  const user = await User.findById(decoded._id);

  if (!user || user.refreshToken !== refreshToken) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid refresh token.");
  }

  const tokenPayload = { _id: user._id, email: user.email, role: user.role };
  const accessToken = createToken(
    tokenPayload,
    process.env.JWT_ACCESS_SECRET,
    process.env.JWT_ACCESS_EXPIRES_IN
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Access token refreshed successfully.",
    data: { accessToken },
  });
});

/**
 * @description Handles user logout by clearing the refresh token.
 */
export const logout = catchAsync(async (req, res) => {
  const { refreshToken } = req.cookies;

  if (refreshToken) {
    await User.findOneAndUpdate(
      { refreshToken },
      { refreshToken: "" },
      { validateBeforeSave: false }
    );
  }

  res.clearCookie("refreshToken");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Logged out successfully.",
    data: null,
  });
});
