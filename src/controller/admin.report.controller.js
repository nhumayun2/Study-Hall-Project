import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { Report } from "../model/report.model.js";
import { User } from "../model/user.model.js";
import { Session } from "../model/session.model.js";
import { Location } from "../model/location.model.js";

/**
 * @description ADMIN gets a paginated and filterable list of all reports.
 * @route GET /api/v1/admin/reports
 * @access Admin
 */
export const getAllReports = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, status, search } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const query = {};

  if (status) query.status = status;

  if (search) {
    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ],
    }).select("_id");

    query.$or = [
      { reporter: { $in: matchingUsers.map((user) => user._id) } },
      { reportSubjectId: { $in: matchingUsers.map((user) => user._id) } }, // For reported users
      { reason: { $regex: search, $options: "i" } },
    ];
  }

  const totalReports = await Report.countDocuments(query);
  const reports = await Report.find(query)
    .populate("reporter", "name email")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Reports retrieved successfully.",
    data: {
      reports,
      total: totalReports,
      page: parseInt(page),
      totalPages: Math.ceil(totalReports / limit),
    },
  });
});

/**
 * @description ADMIN gets detailed information about a single report.
 * @route GET /api/v1/admin/reports/:reportId
 * @access Admin
 */
export const getReportDetails = catchAsync(async (req, res) => {
  const { reportId } = req.params;
  const report = await Report.findById(reportId).populate(
    "reporter",
    "name email"
  );

  if (!report) {
    throw new AppError(httpStatus.NOT_FOUND, "Report not found.");
  }

  // Manually populate the subject of the report since it's polymorphic
  let subject = null;
  if (report.reportSubjectModel === "User") {
    subject = await User.findById(report.reportSubjectId).select(
      "name email role status"
    );
  } else if (report.reportSubjectModel === "Session") {
    subject = await Session.findById(report.reportSubjectId).select(
      "title status isBlocked"
    );
  } else if (report.reportSubjectModel === "Location") {
    subject = await Location.findById(report.reportSubjectId).select(
      "name address isActive"
    );
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Report details fetched successfully.",
    data: { report, subject },
  });
});

/**
 * @description ADMIN updates the status of a report.
 * @route PATCH /api/v1/admin/reports/:reportId/status
 * @access Admin
 */
export const updateReportStatus = catchAsync(async (req, res) => {
  const { reportId } = req.params;
  const { status } = req.body;

  const validStatuses = ["Open", "Resolved", "Closed"];
  if (!status || !validStatuses.includes(status)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Invalid status. Must be one of: ${validStatuses.join(", ")}.`
    );
  }

  const report = await Report.findByIdAndUpdate(
    reportId,
    { status },
    { new: true }
  );
  if (!report) {
    throw new AppError(httpStatus.NOT_FOUND, "Report not found.");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Report status updated to '${status}'.`,
    data: report,
  });
});

/**
 * @description ADMIN takes action on a report (e.g., resolve and block user/session).
 * @route POST /api/v1/admin/reports/:reportId/action
 * @access Admin
 */
export const takeActionOnReport = catchAsync(async (req, res) => {
  const { reportId } = req.params;
  const { action, blockReason } = req.body; // action can be 'resolve_and_warn' or 'resolve_and_block'

  const report = await Report.findById(reportId);
  if (!report || report.status !== "Open") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Report not found or has already been resolved."
    );
  }

  if (action === "resolve_and_block") {
    if (!blockReason) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "A reason is required to block content."
      );
    }

    if (report.reportSubjectModel === "User") {
      await User.findByIdAndUpdate(report.reportSubjectId, {
        status: "Blocked",
      });
    } else if (report.reportSubjectModel === "Session") {
      await Session.findByIdAndUpdate(report.reportSubjectId, {
        isBlocked: true,
        blockReason,
      });
    } else if (report.reportSubjectModel === "Location") {
      await Location.findByIdAndUpdate(report.reportSubjectId, {
        isActive: false,
      });
    }
  }

  report.status = "Resolved";
  await report.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Action '${action}' taken and report has been resolved.`,
    data: report,
  });
});
