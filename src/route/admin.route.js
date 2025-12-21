import express from "express";
import { protect, isAdmin } from "../middleware/auth.middleware.js";

// --- Import all dedicated admin route files ---
import adminUserRoutes from "./admin.user.routes.js";
import adminApplicationRoutes from "./admin.application.routes.js";
import adminSessionRoutes from "./admin.session.routes.js";
import adminLocationRoutes from "./admin.location.routes.js";
import adminProfitRoutes from "./admin.profit.route.js";
import adminTransactionRoutes from "./admin.transaction.routes.js";
import adminReportRoutes from "./admin.report.route.js";
import adminWithdrawalRoutes from "./admin.withdrawal.route.js";
import adminSettingsRoutes from "./admin.settings.route.js";
import adminNotificationRoutes from "./admin.notification.routes.js";
// Note: admin.notification.controller.js logic can be integrated into other controllers or have its own route if needed.

const router = express.Router();

// --- Middleware: Apply authentication and admin verification to ALL routes mounted below ---
router.use(protect, isAdmin);

// ====================================================================
// --- MOUNT ALL ADMIN FEATURE ROUTES ---
// ====================================================================

// Mount User Management routes under /api/v1/admin/users
router.use("/users", adminUserRoutes);

// Mount Tutor Application routes under /api/v1/admin/applications
router.use("/applications", adminApplicationRoutes);

// Mount Session Management routes under /api/v1/admin/sessions
router.use("/sessions", adminSessionRoutes);

// Mount Location Management routes under /api/v1/admin/locations
router.use("/locations", adminLocationRoutes);

// Mount Profit Dashboard routes under /api/v1/admin/profit
router.use("/profit", adminProfitRoutes);

// Mount Transaction Log routes under /api/v1/admin/transactions
router.use("/transactions", adminTransactionRoutes);

// Mount Report Management routes under /api/v1/admin/reports
router.use("/reports", adminReportRoutes);

// Mount Withdrawal Management routes under /api/v1/admin/withdrawals
router.use("/withdrawals", adminWithdrawalRoutes);

// Mount Notification Management routes under /api/v1/admin/notifications
router.use("/notifications", adminNotificationRoutes);

// Mount Global Settings & Category routes under /api/v1/admin/settings
router.use("/settings", adminSettingsRoutes);

export default router;
