import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import { Report } from "../model/report.model.js";

export const createReport = catchAsync(async (req, res) => {
  const { reportedUser, reason, description } = req.body;
  const reporter = req.user._id;

  if (reporter.toString() === reportedUser) {
    throw new AppError(httpStatus.BAD_REQUEST, "You cannot report yourself");
  }

  const report = await Report.create({
    reporter,
    reportedUser,
    reason,
    description,
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Report submitted successfully",
    data: report,
  });
});

export const getAllReports = catchAsync(async (req, res) => {
  const reports = await Report.find({})
    .populate("reporter", "name email")
    .populate("reportedUser", "name email")
    .sort({ createdAt: -1 });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Reports fetched successfully",
    data: reports,
  });
});

export const updateReportStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const report = await Report.findById(id);
  if (!report) {
    throw new AppError(httpStatus.NOT_FOUND, "Report not found");
  }

  report.status = status;
  await report.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Report status updated successfully",
    data: report,
  });
});
