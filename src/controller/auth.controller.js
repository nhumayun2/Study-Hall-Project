import httpStatus from "http-status";
import axios from "axios"; // Used to call Facebook Graph API
import { OAuth2Client } from "google-auth-library"; // Used to verify Google Tokens
import AppError from "../errors/AppError.js";
import { User } from "../model/user.model.js";
import { createToken, verifyToken } from "../utils/authToken.js";
import catchAsync from "../utils/catchAsync.js";
import { generateOTP } from "../utils/commonMethod.js";
import { sendEmail } from "../utils/sendEmail.js";
import sendResponse from "../utils/sendResponse.js";

// Initialize the Google OAuth Client
// We only need the Client ID to verify that the token belongs to THIS app
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * @description Handles new user registration for all roles.
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
    role,
    minors,
  } = req.body;

  if (!name || !email || !password || !username || !gender || !dob || !role) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Please fill in all required fields."
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

  const otp = generateOTP();
  const otpPayload = { otp, email };
  const otpToken = createToken(
    otpPayload,
    process.env.OTP_SECRET,
    process.env.OTP_EXPIRE
  );

  const newUser = await User.create({
    name,
    username,
    email,
    password,
    gender,
    dob,
    role,
    minors: Array.isArray(minors) ? minors : [],
    verificationInfo: { token: otpToken, verified: false },
  });

  await sendEmail(
    newUser.email,
    "Verify Your Email Address",
    `Your verification code is: <strong>${otp}</strong>`
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message:
      "Registration successful! A verification code has been sent to your email.",
    data: { userId: newUser._id, email: newUser.email },
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

  const user = await User.findOne({ email }).select(
    "+password +verificationInfo.token +refreshToken"
  );

  if (!user || !(await user.isPasswordMatched(password))) {
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
      data: { userId: user._id, email: user.email },
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
  delete userResponse.verificationInfo;

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Login successful.",
    data: { user: userResponse, accessToken },
  });
});

// ====================================================================
// --- SECURE SOCIAL LOGIN HELPERS ---
// ====================================================================

/**
 * @description Helper: Verifies Google ID Token using google-auth-library.
 * This ensures the token was issued by Google and is intended for our app.
 */
const verifyGoogleToken = async (token) => {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID, // Specify the CLIENT_ID of the app that accesses the backend
    });
    const payload = ticket.getPayload();
    return {
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      googleId: payload.sub, // 'sub' is the unique Google user ID
    };
  } catch (error) {
    console.error("Google Token Verification Error:", error.message);
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid Google token.");
  }
};

/**
 * @description Helper: Verifies Facebook Access Token via Graph API.
 * We send the token to Facebook's servers to validate it and get the user data.
 */
const verifyFacebookToken = async (token) => {
  try {
    // We request id, name, email, and picture.
    // If the token is invalid, Facebook API will throw an error.
    const { data } = await axios.get(
      `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${token}`
    );
    return {
      email: data.email,
      name: data.name,
      picture: data.picture?.data?.url,
      facebookId: data.id,
    };
  } catch (error) {
    console.error("Facebook Token Verification Error:", error.message);
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid Facebook token.");
  }
};

// ====================================================================
// --- MAIN SOCIAL LOGIN CONTROLLER ---
// ====================================================================

/**
 * @description Handles Social Login (Google & Facebook) securely.
 * Expects { token, provider, role } in req.body
 */
export const socialLogin = catchAsync(async (req, res) => {
  const { token, provider, role } = req.body;

  if (!token || !provider) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Token and provider are required."
    );
  }

  let userData;

  // 1. Verify Token based on provider
  if (provider === "google") {
    userData = await verifyGoogleToken(token);
  } else if (provider === "facebook") {
    userData = await verifyFacebookToken(token);
  } else {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Invalid provider. Use 'google' or 'facebook'."
    );
  }

  const { email, name, picture, googleId, facebookId } = userData;

  if (!email) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Social login failed: Email permission is required from the provider."
    );
  }

  // 2. Check if user exists or create new one
  let user = await User.findOne({ email });

  if (user) {
    // --- USER EXISTS: Link accounts ---
    let isUpdated = false;

    // Link Google ID if not present
    if (provider === "google" && !user.googleId) {
      user.googleId = googleId;
      isUpdated = true;
    }
    // Link Facebook ID if not present
    if (provider === "facebook" && !user.facebookId) {
      user.facebookId = facebookId;
      isUpdated = true;
    }
    // Optional: Update avatar if they don't have one
    if (picture && (!user.avatar || !user.avatar.url)) {
      user.avatar = { url: picture, public_id: "social_login" };
      isUpdated = true;
    }

    if (isUpdated) {
      await user.save({ validateBeforeSave: false });
    }
  } else {
    // --- USER DOES NOT EXIST: Create new account ---

    // Generate unique username
    const baseUsername = email.split("@")[0];
    let username = baseUsername;
    let counter = 1;
    while (await User.findOne({ username })) {
      username = `${baseUsername}${counter++}`;
    }

    user = await User.create({
      name: name || "User",
      username,
      email,
      googleId: googleId || undefined,
      facebookId: facebookId || undefined,
      role: role || "Student", // Default to Student if not provided
      avatar: { url: picture || "", public_id: "social_login" },
      verificationInfo: { verified: true }, // Social accounts are verified
      status: "Active",
    });
  }

  // Check blockage
  if (user.status === "Blocked") {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Your account has been blocked. Please contact support."
    );
  }

  // 3. Generate Tokens
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
  delete userResponse.verificationInfo;

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `${
      provider.charAt(0).toUpperCase() + provider.slice(1)
    } login successful.`,
    data: { user: userResponse, accessToken },
  });
});

// ====================================================================
// --- STANDARD AUTH CONTROLLERS ---
// ====================================================================

export const verifyEmail = catchAsync(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "Email and OTP are required.");
  }

  const user = await User.findOne({ email }).select("+verificationInfo.token");

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

export const changePassword = catchAsync(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const userId = req.user._id;

  const user = await User.findById(userId).select("+password");

  if (!user || !(await user.isPasswordMatched(oldPassword))) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      "The old password is not correct."
    );
  }

  user.password = newPassword;
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password changed successfully.",
    data: null,
  });
});

export const refreshToken = catchAsync(async (req, res) => {
  const { refreshToken } = req.cookies;

  if (!refreshToken) {
    throw new AppError(httpStatus.UNAUTHORIZED, "You are not authorized.");
  }

  const decoded = verifyToken(refreshToken, process.env.JWT_REFRESH_SECRET);
  const user = await User.findById(decoded._id).select("+refreshToken");

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
