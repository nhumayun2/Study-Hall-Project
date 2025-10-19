import express from "express";

// --- Import all FINAL, REFACTORED route files ---
import authRoutes from "../src/route/auth.route.js";
import userRoutes from "../src/route/user.route.js";
import sessionRoutes from "../src/route/session.route.js";
import locationRoutes from "../src/route/location.route.js";
import reviewRoutes from "../src/route/review.route.js";
import financialRoutes from "../src/route/financial.route.js";
import tutorRoutes from "../src/route/tutor.route.js";
import tutorAvailabilityRoutes from "../src/route/tutorAvailability.route.js";
import withdrawalRoutes from "../src/route/withdrawal.route.js";
import chatRoutes from "../src/route/chat.route.js";
import reportRoutes from "../src/route/report.route.js";
import notificationRoutes from "../src/route/notification.route.js";
import adminRoutes from "../src/route/admin.route.js";
import onboardingRoutes from "../src/route/onboarding.route.js";

const router = express.Router();

// ====================================================================
// --- MOUNTING ALL APPLICATION ROUTES ---
// ====================================================================

// Core User & Auth
router.use("/auth", authRoutes);
router.use("/users", userRoutes); // Manages user profiles and minors

// Core Business Logic
router.use("/sessions", sessionRoutes); // The new unified session router
router.use("/locations", locationRoutes);
router.use("/reviews", reviewRoutes);

// Financials
router.use("/financials", financialRoutes);
router.use("/withdrawals", withdrawalRoutes);
router.use("/onboarding", onboardingRoutes);

// Tutor Specific Processes
router.use("/tutors", tutorRoutes); // Handles the "apply to be a tutor" process
router.use("/availability", tutorAvailabilityRoutes); // Tutor sets their calendar

// Supporting Features
router.use("/chat", chatRoutes);
router.use("/reports", reportRoutes);
router.use("/notifications", notificationRoutes);

// Admin Panel Hub
router.use("/admin", adminRoutes);

// --- The following routes are now obsolete and have been removed ---
// router.use("/courses", courseRouter);
// router.use("/tutor/courses", tutorCourseRouter);
// router.use("/minors", minorRoute);

export default router;

// import express from "express";
// import authRoute from "../src/route/auth.route.js";
// import userRoute from "../src/route/user.route.js";
// import courseRouter from "../src/route/course.route.js";
// import locationRoute from "../src/route/location.route.js";
// import tutorRoute from "../src/route/tutor.route.js";
// import tutorCourseRouter from "../src/route/tutor.course.route.js";
// import tutorAvailabilityRoute from "../src/route/tutorAvailability.route.js";
// import sessionRoute from "../src/route/session.route.js";
// import reviewRoute from "../src/route/review.route.js";
// import financialRoute from "../src/route/financial.route.js";
// import chatRoute from "../src/route/chat.route.js";
// import notificationRoute from "../src/route/notification.route.js";
// import reportRoute from "../src/route/report.route.js";
// import adminRoute from "../src/route/admin.route.js";
// import withdrawalRouter from "../src/route/withdrawal.route.js";
// import minorRoute from "../src/route/minor.route.js";

// const router = express.Router();

// // Mounting the routes
// router.use("/auth", authRoute);
// router.use("/users", userRoute);
// router.use("/courses", courseRouter);
// router.use("/locations", locationRoute);
// router.use("/tutor", tutorRoute);
// router.use("/tutor/courses", tutorCourseRouter);
// router.use("/tutor/availability", tutorAvailabilityRoute);
// router.use("/session", sessionRoute);
// router.use("/reviews", reviewRoute);
// router.use("/financial", financialRoute);
// router.use("/chat", chatRoute);
// router.use("/notifications", notificationRoute);
// router.use("/reports", reportRoute);
// router.use("/admin", adminRoute);
// router.use("/minors", minorRoute);
// router.use("/withdrawals", withdrawalRouter);

// export default router;
