import jwt from "jsonwebtoken";
import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import { User } from "./../model/user.model.js";

// Helper function to safely get and convert the role to lowercase for comparison
//const getRole = (req) => req.user?.role?.toLowerCase();

export const protect = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) throw new AppError(httpStatus.NOT_FOUND, "Token not found");

  try {
    const decoded = await jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const user = await User.findById(decoded._id);
    if (user && (await User.isOTPVerified(user._id))) {
      req.user = user;
    }
    next();
  } catch (err) {
    throw new AppError(401, "Invalid token");
  }
};

// --- Corrected Role Check Middlewares ---

export const isAdmin = (req, res, next) => {
  // Comparing the lowercase role to 'admin'
  if (req.user.role !== "Admin") {
    throw new AppError(403, "Access denied. You are not an admin.");
  }
  next();
};

export const isTutor = (req, res, next) => {
  // Comparing the lowercase role to 'tutor'
  if (req.user.role !== "Tutor") {
    throw new AppError(403, "Access denied. You are not a tutor.");
  }
  next();
};

export const isLocationOwner = (req, res, next) => {
  // Comparing the lowercase role to 'locationowner'
  console.log(req.user.role);
  if (req.user.role != "LocationOwner") {
    throw new AppError(403, "Access denied. You are not a location owner.");
  }
  next();
};

export const isStudent = (req, res, next) => {
  // Comparing the role to 'Student'
  if (req.user.role !== "Student") {
    // <-- Use direct comparison like the others
    throw new AppError(403, "Access denied. You are not a student.");
  }
  next();
};
