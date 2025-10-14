import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import AppError from "../errors/AppError.js";
import { Report } from "../model/report.model.js";
import { User } from "../model/user.model.js";

/**
 * @desc Admin: Get all reports with advanced filtering and pagination
 * @route GET /api/v1/admin/reports
 * @access Admin
 */
export const getAllReportsAdmin = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, status, search } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const query = {}; // Filter by status (Pending, Resolved, Rejected)

  if (status) {
    query.status = status;
  } // Search filter: search by reporter or reported user name/email

  if (search) {
    // Find users whose name or email matches the search term
    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ],
    }).select("_id");
    const userIds = matchingUsers.map((user) => user._id);
    query.$or = [
      { reporter: { $in: userIds } },
      { reportedUser: { $in: userIds } },
    ];
  }

  const totalReports = await Report.countDocuments(query);
  const reports = await Report.find(query)
    .populate("reporter", "name email role")
    .populate("reportedUser", "name email role isBlocked") // Include isBlocked for quick admin action view
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit)); // Format data for admin dashboard table view

  const formattedReports = reports.map((report) => ({
    id: report._id,
    reporterName: report.reporter.name,
    reportedUserName: report.reportedUser.name,
    reason: report.reason,
    description:
      report.description.substring(0, 50) +
      (report.description.length > 50 ? "..." : ""),
    status: report.status,
    reportedUserBlocked: report.reportedUser.isBlocked,
    createdAt: new Date(report.createdAt).toLocaleString(),
  }));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Reports retrieved successfully for Admin Panel",
    data: {
      reports: formattedReports,
      total: totalReports,
      page: parseInt(page),
      limit: parseInt(limit),
    },
  });
});

/**
 * @desc Admin: Get detailed report information
 * @route GET /api/v1/admin/reports/:reportId
 * @access Admin
 */
export const getReportDetailsAdmin = catchAsync(async (req, res) => {
  const { reportId } = req.params;

  const report = await Report.findById(reportId)
    .populate("reporter", "name email role phone")
    .populate("reportedUser", "name email role phone isBlocked");

  if (!report) {
    throw new AppError(httpStatus.NOT_FOUND, "Report not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Report details fetched successfully",
    data: report,
  });
});

/**
 * @desc Admin: Update report status (e.g., mark as Resolved or Rejected)
 * @route PATCH /api/v1/admin/reports/:reportId/status
 * @access Admin
 */
export const updateReportStatusAdmin = catchAsync(async (req, res) => {
  const { reportId } = req.params;
  const { status } = req.body;
  if (!status) {
    throw new AppError(httpStatus.BAD_REQUEST, "Status is required.");
  }

  const validStatuses = ["Resolved", "Rejected"];
  if (!validStatuses.includes(status)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Invalid status provided. Use 'Resolved' or 'Rejected'."
    );
  }

  const report = await Report.findByIdAndUpdate(
    reportId,
    { status },
    { new: true }
  );

  if (!report) {
    throw new AppError(httpStatus.NOT_FOUND, "Report not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Report status updated to ${status}`,
    data: report,
  });
});
