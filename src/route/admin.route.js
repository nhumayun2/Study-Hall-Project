import express from "express";
import { protect, isAdmin } from "../middleware/auth.middleware.js";
// Assuming a general admin controller exists for dashboard/stats
// import { getAdminDashboardData } from '../controller/admin.controller.js';
import {
  getAllWithdrawalsAdmin,
  approveWithdrawalAdmin,
  rejectWithdrawalAdmin,
} from "../controller/withdrawal.controller.js";
import {
  getAllReportsAdmin,
  getReportDetailsAdmin,
  updateReportStatusAdmin,
} from "../controller/admin.report.controller.js";
import { sendNotificationsAdmin } from "../controller/admin.notification.controller.js";
import {
  getSettingsAdmin,
  updateSettingsAdmin,
} from "../controller/settings.controller.js";

// --- Import dedicated route files ---
import courseRoutes from "./admin.course.route.js";
import sessionRoutes from "./admin.session.routes.js";
import profitRoutes from "./admin.profit.route.js";
import userRoutes from "./admin.user.routes.js";
import locationRoutes from "./admin.location.routes.js";
import transactionRoutes from "./admin.transaction.routes.js";
import applicationRoutes from "./admin.application.routes.js";

const adminRouter = express.Router();

// --- Middleware: Apply authentication and admin verification to all admin routes ---
adminRouter.use(protect, isAdmin);

// -------------------------------------------------------------
// FEATURE MANAGEMENT INTEGRATION
// -------------------------------------------------------------

// 1. Course Management
adminRouter.use("/courses", courseRoutes);

// 2. Session Management
adminRouter.use("/sessions", sessionRoutes);

// 3. Profit Management
adminRouter.use("/profit", profitRoutes);

// 4. User Management
adminRouter.use("/users", userRoutes);

// 5. Location Management
adminRouter.use("/locations", locationRoutes);

// 6. Transaction Management
adminRouter.use("/transactions", transactionRoutes);

// 7. Application Review / KYC Management (Tutor Applications)
adminRouter.use("/applications", applicationRoutes); // NEW ROUTE MOUNTED

// -------------------------------------------------------------
// EXISTING ADMIN ROUTES
// -------------------------------------------------------------

// Withdrawal Management
adminRouter.get("/withdrawals", getAllWithdrawalsAdmin);
adminRouter.patch("/withdrawals/:withdrawalId/approve", approveWithdrawalAdmin);
adminRouter.patch("/withdrawals/:withdrawalId/reject", rejectWithdrawalAdmin);

// Report Management
adminRouter.get("/reports", getAllReportsAdmin);
adminRouter.get("/reports/:reportId", getReportDetailsAdmin);
adminRouter.patch("/reports/:reportId/status", updateReportStatusAdmin);

// Notification Management
adminRouter.post("/notifications/send", sendNotificationsAdmin);

// Settings Management
adminRouter.get("/settings", getSettingsAdmin);
adminRouter.patch("/settings", updateSettingsAdmin);

export default adminRouter;
