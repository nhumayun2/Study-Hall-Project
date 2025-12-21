import jwt from "jsonwebtoken";
import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import { User } from "../model/user.model.js";

export const protect = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return next(
      new AppError(
        httpStatus.UNAUTHORIZED,
        "Authentication token not found. Please log in."
      )
    );
  }

  try {
    // This should now work correctly
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const user = await User.findById(decoded._id);

    if (!user) {
      return next(
        new AppError(
          httpStatus.UNAUTHORIZED,
          "The user belonging to this token no longer exists."
        )
      );
    }

    if (!user.verificationInfo.verified) {
      return next(
        new AppError(
          httpStatus.FORBIDDEN,
          "This user account has not been verified."
        )
      );
    }

    req.user = user;
    next();
  } catch (err) {
    // This block catches errors like invalid signature or expired token
    return next(
      new AppError(
        httpStatus.UNAUTHORIZED,
        "Invalid or expired token. Please log in again."
      )
    );
  }
};

// --- Role Check Middlewares ---
export const isAdmin = (req, res, next) => {
  if (req.user?.role !== "Admin") {
    return next(
      new AppError(httpStatus.FORBIDDEN, "Access denied. You are not an admin.")
    );
  }
  next();
};

export const isTutor = (req, res, next) => {
  if (req.user?.role !== "Tutor") {
    return next(
      new AppError(httpStatus.FORBIDDEN, "Access denied. You are not a tutor.")
    );
  }
  next();
};

export const isLocationOwner = (req, res, next) => {
  if (req.user?.role !== "LocationOwner") {
    return next(
      new AppError(
        httpStatus.FORBIDDEN,
        "Access denied. You are not a location owner."
      )
    );
  }
  next();
};

export const isStudent = (req, res, next) => {
  if (req.user?.role !== "Student") {
    return next(
      new AppError(
        httpStatus.FORBIDDEN,
        "Access denied. You are not a student."
      )
    );
  }
  next();
};
